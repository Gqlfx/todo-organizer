import Dexie, { type EntityTable } from 'dexie'

/** 1 = 周一 … 7 = 周日（与 Settings.day_capacity 的键一致） */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type TaskStatus = 'todo' | 'done' | 'deferred' | 'dropped'
export type Bucket = 'now' | 'today' | 'week' | 'later'
export type Repeat = 'none' | 'weekly'
export type SlotSource = 'ai' | 'user'

/** 严格对齐 docs/规格-待办整理器-v1.0.md 第二节「数据模型（最终）」 */
export interface Task {
  id: string
  title: string
  raw_input: string
  status: TaskStatus

  // 固定占用
  is_fixed: boolean
  start_at: string | null
  end_at: string | null
  repeat: Repeat

  // 软任务
  est_min: number | null
  due_at: string | null
  /** "我打算哪天做"（YYYY-MM-DD）；null = 今天，没指定 */
  plan_date: string | null

  // 判定
  bucket: Bucket
  bucket_reason: string | null
  manual_priority: boolean
  importance: number | null
  urgency_manual: number | null

  // 排布
  queue_rank: number | null
  slot_source: SlotSource
  is_locked: boolean
  pinned: boolean
  defer_count: number

  // 溯源
  parse_confidence: number | null
  created_at: string
  done_at: string | null
}

export type DayCapacity = Record<Weekday, number>

/**
 * 用户手动改档的记录。V0.1 没有拖拽，这是 AI 分档唯一的学习信号。
 * 只追加，不修改、不删除。
 */
export interface Correction {
  id: string
  title: string
  from_bucket: Bucket
  to_bucket: Bucket
  at: string
}

export interface Settings {
  id: 1
  /** 周一..周日，单位分钟 */
  day_capacity: DayCapacity
  /** "YYYY-MM-DD": 分钟 */
  capacity_override: Record<string, number>
  work_start: string
  work_end: string
  buffer_min: number
  min_gap_min: number
  prefs_json: string
  ai_key: string
}

/**
 * 默认七天容量：按真实课表第 10 周（最满的一周）实测得出，单位分钟。
 * 周一 1h / 周二 2h / 周三 2.5h / 周四 4h / 周五 2h / 周六 5h / 周日 5h
 */
export const DEFAULT_DAY_CAPACITY: DayCapacity = {
  1: 60,
  2: 120,
  3: 150,
  4: 240,
  5: 120,
  6: 300,
  7: 300,
}

/**
 * 上一版（Day 1–2 首版）的默认值。只用于一件判断：
 * 这一天用户到底有没有动过 —— 还等于旧默认值 = 没动过，可以换成新默认值。
 */
const PREVIOUS_DEFAULT_DAY_CAPACITY: DayCapacity = {
  1: 180,
  2: 120,
  3: 180,
  4: 120,
  5: 240,
  6: 480,
  7: 480,
}

const PREVIOUS_MIN_GAP_MIN = 15

export const SETTINGS_ID = 1 as const

export const DEFAULT_SETTINGS: Settings = {
  id: SETTINGS_ID,
  day_capacity: { ...DEFAULT_DAY_CAPACITY },
  capacity_override: {},
  work_start: '08:00',
  work_end: '23:00',
  buffer_min: 10,
  min_gap_min: 10,
  prefs_json: '{}',
  ai_key: '',
}

/**
 * v1 → v2 的默认值迁移，逐天判断，不整行覆盖：
 * 只有「仍然一字不差等于上一版默认值」的那一天才换成新默认值。
 * 用户改过的值哪怕只差 1 分钟，也原样保留。
 * 返回空对象 = 不需要写库。
 */
export function upgradeDefaults(current: Settings): Partial<Settings> {
  const day_capacity: DayCapacity = { ...current.day_capacity }
  let daysChanged = false

  for (const day of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
    if (day_capacity[day] === PREVIOUS_DEFAULT_DAY_CAPACITY[day]) {
      day_capacity[day] = DEFAULT_DAY_CAPACITY[day]
      daysChanged = true
    }
  }

  const patch: Partial<Settings> = {}
  if (daysChanged) patch.day_capacity = day_capacity
  if (current.min_gap_min === PREVIOUS_MIN_GAP_MIN) patch.min_gap_min = 10
  return patch
}

export const DB_NAME = 'todo-organizer'

export const db = new Dexie(DB_NAME) as Dexie & {
  tasks: EntityTable<Task, 'id'>
  settings: EntityTable<Settings, 'id'>
  corrections: EntityTable<Correction, 'id'>
}

// 索引只建后续真的要按它查询的字段，不为“将来可能的同步”留任何字段。
const TASK_INDEXES_V1 = 'id, status, bucket, is_fixed, due_at, queue_rank, created_at, done_at'

const STORES_V1 = {
  tasks: TASK_INDEXES_V1,
  settings: 'id',
}

const STORES_V3 = {
  tasks: `${TASK_INDEXES_V1}, plan_date`,
  settings: 'id',
}

// v4：加纠正记录表（全部列表里「挪到今天」时追加），表结构只增不改
const STORES_V4 = {
  ...STORES_V3,
  corrections: 'id, at, from_bucket, to_bucket',
}

db.version(1).stores(STORES_V1)

// v2：只做默认值迁移，表结构没变（Day 1–2 的收尾修正：默认值与碎片阈值）
db.version(2)
  .stores(STORES_V1)
  .upgrade(async (tx) => {
    const table = tx.table('settings')
    const current = (await table.get(SETTINGS_ID)) as Settings | undefined
    if (!current) return
    const patch = upgradeDefaults(current)
    if (Object.keys(patch).length > 0) await table.update(SETTINGS_ID, patch)
  })

// v3：加 plan_date（Day 5-6）。老任务按 created_at 的本地日期补上，不丢、不猜。
db.version(3)
  .stores(STORES_V3)
  .upgrade(async (tx) => {
    await tx
      .table('tasks')
      .toCollection()
      .modify((task: Task) => {
        if (task.plan_date === undefined || task.plan_date === null || task.plan_date === '') {
          task.plan_date = localDayOf(task.created_at)
        }
      })
  })

// v4：新增 corrections 表，只追加不改；没有数据迁移
db.version(4).stores(STORES_V4)

/** ISO 时间戳 → 本地日期键（不能直接切前 10 位：那是 UTC 日期，会跨天） */
function localDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function newTaskId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
