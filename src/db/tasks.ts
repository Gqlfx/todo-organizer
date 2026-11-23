import { useLiveQuery } from 'dexie-react-hooks'
import { db, newTaskId, type Settings, type Task } from './db'
import { DEFAULT_EST_MIN, nextFittingDate } from '../lib/queue'
import { dateKey } from '../lib/capacity'
import { formatClock } from '../lib/time'
import { extractNotBefore } from '../lib/notBefore'
import type { ParsedItem } from '../lib/parse'

/** 全部任务（队列页只用 todo，全部页按 bucket 分组；done 进「今天已完成」） */
export function useTasks(): Task[] | undefined {
  return useLiveQuery(() => db.tasks.toArray(), [])
}

/**
 * 输入框提交：一行 = 一条任务，不解析、不确认、不改写原文。
 * 立刻建卡（乐观入队），解析在后台做，回来再原地更新。
 * parse_confidence = 0 表示「还没解析成功」：0=未定，null=从未尝试（老数据/手建），1=已解析。
 */
export async function createTasksFromLines(lines: string[]): Promise<Task[]> {
  const clean = lines.map((line) => line.trim()).filter((line) => line.length > 0)
  if (clean.length === 0) return []

  const base = Date.now()
  const tasks: Task[] = clean.map((line, index) => ({
    id: newTaskId(),
    title: line,
    raw_input: line,
    status: 'todo',
    is_fixed: false,
    start_at: null,
    end_at: null,
    repeat: 'none',
    est_min: DEFAULT_EST_MIN,
    due_at: null,
    plan_date: null,
    // 建卡当时就能从原文算出锚点，不用等模型：八点就是八点
    not_before: extractNotBefore(line),
    bucket: 'today',
    bucket_reason: null,
    manual_priority: false,
    importance: null,
    urgency_manual: null,
    queue_rank: null,
    slot_source: 'ai',
    is_locked: false,
    pinned: false,
    defer_count: 0,
    parse_confidence: 0,
    created_at: new Date(base + index).toISOString(),
    done_at: null,
  }))

  await db.tasks.bulkAdd(tasks)
  return tasks
}

/**
 * 按 raw_index 把解析结果合并回刚建的那些卡。
 * 模型漏掉的行保持原样（parse_confidence 还是 0 → 显示「未定时间」），不删不藏。
 */
export async function applyParsedItems(taskIds: string[], items: ParsedItem[]): Promise<void> {
  const byIndex = new Map<number, ParsedItem>()
  for (const item of items) {
    if (item.raw_index < taskIds.length && !byIndex.has(item.raw_index)) {
      byIndex.set(item.raw_index, item)
    }
  }

  await db.transaction('rw', db.tasks, async () => {
    for (let index = 0; index < taskIds.length; index += 1) {
      const item = byIndex.get(index)
      if (!item) continue

      const task = await db.tasks.get(taskIds[index])
      if (!task) continue

      const isFixed = item.is_fixed && item.start_at !== null

      await db.tasks.update(taskIds[index], {
        title: item.title ?? task.title,
        due_at: item.due_at,
        start_at: isFixed ? item.start_at : null,
        end_at: isFixed ? item.end_at : null,
        // 固定事件的 est 是时长：模型没说就留 null，让 computeQueue 用 60 分钟兜底
        est_min: isFixed ? item.est_min : (item.est_min ?? DEFAULT_EST_MIN),
        is_fixed: isFixed,
        // 固定事件用 start_at 占死时间，锚点必须让位，否则同一条任务有两个开始时刻
        not_before: isFixed ? null : task.not_before,
        parse_confidence: 1,
      })
    }
  })
}

/**
 * 全部列表里的手动改档，两个方向都记纠正：
 * - 挪到今天：bucket → today，同时清 plan_date（否则被顺延到明天的任务改了档也进不了今天队列）
 * - 挪到本周：bucket → week，从今天队列里撤走
 * 同一次事务里追加纠正记录，这是 V0.1 里 AI 分档唯一的学习信号。
 */
export async function moveTaskBucket(task: Task, toBucket: 'today' | 'week'): Promise<void> {
  await db.transaction('rw', db.tasks, db.corrections, async () => {
    const patch: Partial<Task> = { bucket: toBucket }
    if (toBucket === 'today') patch.plan_date = null
    await db.tasks.update(task.id, patch)

    await db.corrections.add({
      id: newTaskId(),
      title: task.title,
      from_bucket: task.bucket,
      to_bucket: toBucket,
      at: new Date().toISOString(),
    })
  })
}

/** 完成：点圆圈立刻消失，数据保留 */
export async function completeTask(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { status: 'done', done_at: new Date().toISOString() })
}

/** 取消完成：回到队列（排序规则会把它放回原来的位置） */
export async function uncompleteTask(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { status: 'todo', done_at: null })
}

/** 顺延：plan_date 挪到下一个装得下的日子，defer_count + 1 */
export async function deferTask(
  task: Task,
  tasks: Task[],
  settings: Settings,
  now: Date,
): Promise<string> {
  const target = nextFittingDate(task, tasks, settings, now)
  await db.tasks.update(task.id, {
    plan_date: target,
    defer_count: (task.defer_count ?? 0) + 1,
  })
  return target
}

/** 从「明天」拉回今天：plan_date 置空 = 今天 */
export async function pullTaskToToday(taskId: string): Promise<void> {
  await db.tasks.update(taskId, { plan_date: null })
}

/**
 * 改固定事件的结束时刻：改完置 is_locked —— 这是用户定的时间，以后不再被兜底覆盖。
 * 日期部分保留原值（weekly 事件靠 start_at 的日期判断星期几，end 的日期不影响计算）。
 */
export async function setFixedEnd(task: Task, minutes: number, now: Date): Promise<void> {
  const datePart =
    task.end_at && /^\d{4}-\d{2}-\d{2}/.test(task.end_at)
      ? task.end_at.slice(0, 10)
      : dateKey(now)
  await db.tasks.update(task.id, {
    end_at: `${datePart}T${formatClock(minutes)}`,
    is_locked: true,
  })
}
