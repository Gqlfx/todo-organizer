import { useLiveQuery } from 'dexie-react-hooks'
import { db, newTaskId, type Task } from './db'

/**
 * Day 1-2 只需要证明 Task 表“能写能读”，队列视图还没做。
 * 所以这里放一个最小的自检：写入一条带标记的任务，立刻读回。
 * 标记只用于“清除测试数据”，不会碰到真实任务。
 */
const PROBE_TAG = '__day1_probe__'

export const PROBE_MARK = PROBE_TAG

export function useTaskCount(): number | undefined {
  return useLiveQuery(() => db.tasks.count(), [], undefined)
}

export async function writeProbeTask(): Promise<Task> {
  const task: Task = {
    id: newTaskId(),
    title: '测试任务',
    raw_input: PROBE_TAG,
    status: 'todo',
    is_fixed: false,
    start_at: null,
    end_at: null,
    repeat: 'none',
    est_min: 30,
    due_at: null,
    plan_date: null,
    not_before: null,
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
    parse_confidence: null,
    created_at: new Date().toISOString(),
    done_at: null,
  }

  await db.tasks.put(task)
  const readBack = await db.tasks.get(task.id)
  if (!readBack) throw new Error('写入成功但读不回来')
  return readBack
}

export async function clearProbeTasks(): Promise<number> {
  const keys = await db.tasks.filter((task) => task.raw_input === PROBE_TAG).primaryKeys()
  await db.tasks.bulkDelete(keys)
  return keys.length
}
