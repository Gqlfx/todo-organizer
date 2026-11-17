import { db, newTaskId, type Bucket, type Repeat, type Task } from '../db/db'

export interface TaskSeed {
  title: string
  est_min?: number | null
  is_fixed?: boolean
  start_at?: string | null
  end_at?: string | null
  repeat?: Repeat
  due_at?: string | null
  bucket?: Bucket
  plan_date?: string | null
}

/**
 * 只在 dev 暴露的小口子：Day 3-4 没有“新建固定事件”和“改估时”的界面，
 * 但验收（10 分钟任务塞碎片、固定行渲染）需要这类数据。
 * 生产构建里不会安装（main.tsx 只在 import.meta.env.DEV 时动态引入）。
 */
export function installDevBridge(): void {
  const bridge = {
    db,
    async addTask(seed: TaskSeed): Promise<string> {
      const task: Task = {
        id: newTaskId(),
        title: seed.title,
        raw_input: seed.title,
        status: 'todo',
        is_fixed: seed.is_fixed ?? false,
        start_at: seed.start_at ?? null,
        end_at: seed.end_at ?? null,
        repeat: seed.repeat ?? 'none',
        est_min: seed.est_min ?? null,
        due_at: seed.due_at ?? null,
        plan_date: seed.plan_date ?? null,
        bucket: seed.bucket ?? 'today',
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
      await db.tasks.add(task)
      return task.id
    },
  }

  ;(window as unknown as { __todo?: typeof bridge }).__todo = bridge
  console.info(
    '[dev] __todo.addTask({ title, est_min, is_fixed, start_at, end_at }) —— 用来造固定事件和短任务',
  )
}
