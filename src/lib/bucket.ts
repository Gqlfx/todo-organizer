import { db, type Bucket, type Correction, type Settings, type Task } from '../db/db'
import { chat, LlmError } from './llm'
import { dateKey, resolveCapacity, weekdayOf } from './capacity'
import { formatClock, minutesOfDay, parseClock, parseDateTimeValue } from './time'
import { DEFAULT_EST_MIN, occursOn } from './queue'

/**
 * /api/bucket：只做分档，不排序、不出时间。
 * 批量：一次最多 8 条新任务，一次请求；失败全部留在 today，不阻塞任何交互。
 */

const MAX_BATCH = 8
const BUCKETS: Bucket[] = ['now', 'today', 'week', 'later']

function estOf(task: Task): number {
  return task.est_min && task.est_min > 0 ? Math.round(task.est_min) : DEFAULT_EST_MIN
}

/** 今天从「现在」到 work_end 真正空着多少分钟（扣掉固定事件和它们两端的 buffer） */
function gapTotalOfToday(tasks: Task[], settings: Settings, now: Date): number {
  const todayKey = dateKey(now)
  const weekday = weekdayOf(now)
  const workStart = parseClock(settings.work_start) ?? 8 * 60
  const workEnd = parseClock(settings.work_end) ?? 23 * 60
  const windowStart = Math.max(minutesOfDay(now), workStart)
  const windowEnd = Math.max(windowStart, workEnd)
  const buffer = Math.max(0, settings.buffer_min)

  const busy = tasks
    .filter((task) => task.status === 'todo' && task.is_fixed)
    .map((task) => {
      const start = parseDateTimeValue(task.start_at)
      if (!start || !occursOn(task, todayKey, weekday)) return null
      const end = parseDateTimeValue(task.end_at)
      const est = task.est_min && task.est_min > 0 ? Math.round(task.est_min) : 60
      const endMin = end && end.minutes > start.minutes ? end.minutes : start.minutes + est
      return { start: start.minutes - buffer, end: endMin + buffer }
    })
    .filter((block): block is { start: number; end: number } => block !== null)
    .sort((a, b) => a.start - b.start)

  let cursor = windowStart
  let total = 0
  for (const block of busy) {
    const start = Math.max(block.start, windowStart)
    const end = Math.min(block.end, windowEnd)
    if (end <= cursor) continue
    if (start > cursor) total += start - cursor
    cursor = Math.max(cursor, end)
  }
  if (cursor < windowEnd) total += windowEnd - cursor
  return total
}

export interface BucketPayload {
  now: string
  new_tasks: Array<{
    id: string
    title: string
    raw_input: string
    due_at: string | null
    est_min: number
  }>
  load: {
    counts: Record<Bucket, number>
    today_minutes: number
    capacity_min: number
    gap_total_min: number
    slack_min: number
    nearest_due: string | null
  }
  corrections: Array<{ title: string; from_bucket: Bucket; to_bucket: Bucket }>
  prefs: unknown[]
}

export function buildBucketPayload(
  batch: Task[],
  allTasks: Task[],
  corrections: Correction[],
  settings: Settings,
  now: Date,
): BucketPayload {
  const batchIds = new Set(batch.map((task) => task.id))
  const others = allTasks.filter(
    (task) => task.status === 'todo' && !task.is_fixed && !batchIds.has(task.id),
  )

  const counts: Record<Bucket, number> = { now: 0, today: 0, week: 0, later: 0 }
  for (const task of others) counts[task.bucket] += 1

  const todayMinutes = others
    .filter((task) => task.bucket === 'now' || task.bucket === 'today')
    .reduce((sum, task) => sum + estOf(task), 0)

  const capacity = Math.max(0, resolveCapacity(settings, now).minutes)

  const dueValues = batch
    .map((task) => task.due_at)
    .filter((value): value is string => typeof value === 'string' && value.length >= 10)
    .sort()

  let prefs: unknown[] = []
  try {
    const parsed = JSON.parse(settings.prefs_json || '[]') as unknown
    if (Array.isArray(parsed)) prefs = parsed
  } catch {
    prefs = []
  }

  return {
    now: `${dateKey(now)}T${formatClock(minutesOfDay(now))}`,
    new_tasks: batch.map((task) => ({
      id: task.id,
      title: task.title,
      raw_input: task.raw_input,
      due_at: task.due_at,
      est_min: estOf(task),
    })),
    load: {
      counts,
      today_minutes: todayMinutes,
      capacity_min: capacity,
      gap_total_min: gapTotalOfToday(allTasks, settings, now),
      slack_min: Math.max(0, capacity - todayMinutes),
      nearest_due: dueValues[0] ?? null,
    },
    corrections: corrections.slice(-10).map((item) => ({
      title: item.title,
      from_bucket: item.from_bucket,
      to_bucket: item.to_bucket,
    })),
    prefs,
  }
}

export function buildBucketSystemPrompt(): string {
  return `你是待办分档器。把每条新任务放进且只放进一个档位：now / today / week / later。

按优先级判断：
1. 有明确截止且在 3 天内的任务 → 至少 today，不许 week / later。
2. 没提时间的 → today（不是 later）。只有"有空再说 / 以后 / 不急"才放 later。
3. 任务记录里 age_days > 3 且未完成 → 至少 today。
4. reason 不超过 20 个字，只能引用输入里已有的字段（截止时间、估时、今天空档、顺延次数、标题），
   不许编造难度、谁在等、进度之类看不出来的信息。

load.gap_total_min 只用来写理由（例如"今日空档 0 分钟"），不许因为空档少就改档位。

时态词表：
- 一会 / 马上 / 顺手 / 现在 → now
- 今天 / 今晚 / 待会 → today
- 这周 / 这几天 / 下周初 → week
- 有空再说 / 以后 / 不急 → later
- 没提时间 → today

只输出 JSON：
{"items":[{"id":"...","bucket":"today","reason":"..."}]}

id 必须来自输入的 new_tasks；每条都要有，不许新增、不许遗漏。
bucket 只能是 now / today / week / later 之一。`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 和 parse 一样的三层解包：顶层 content → items 数组 */
export function unwrapBucketItems(content: string): Array<Record<string, unknown>> | null {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return null
  }

  if (isRecord(value) && 'content' in value) {
    const inner = value.content
    if (typeof inner === 'string') {
      try {
        value = JSON.parse(inner)
      } catch {
        return null
      }
    } else {
      value = inner
    }
  }

  if (!isRecord(value) || !Array.isArray(value.items)) return null
  return value.items.filter(isRecord)
}

/** 契约兜底：id 不在输入里就丢，非法 bucket 按 today，缺的补 today */
function normalizeBucket(
  items: Array<Record<string, unknown>>,
  batch: Task[],
): Map<string, { bucket: Bucket; reason: string }> {
  const allowed = new Set(batch.map((task) => task.id))
  const result = new Map<string, { bucket: Bucket; reason: string }>()

  for (const item of items) {
    const id = item.id
    if (typeof id !== 'string' || !allowed.has(id) || result.has(id)) continue
    const bucket = BUCKETS.includes(item.bucket as Bucket) ? (item.bucket as Bucket) : 'today'
    const reason = typeof item.reason === 'string' ? item.reason.slice(0, 20) : ''
    result.set(id, { bucket, reason })
  }

  return result
}

/**
 * 给一批新任务分档。任何一段失败（网络、结构、超时）都不抛给调用方：
 * 任务留在 today，用户什么都感觉不到。
 */
export async function assignBucketsByIds(
  ids: string[],
  settings: Settings,
  now: Date,
): Promise<number> {
  const tasks = await db.tasks.bulkGet(ids)
  const batch = tasks.filter((task): task is Task => !!task)
  if (batch.length === 0) return 0

  const allTasks = await db.tasks.toArray()
  const corrections = await db.corrections.orderBy('at').reverse().limit(10).toArray()

  let updated = 0
  for (let offset = 0; offset < batch.length; offset += MAX_BATCH) {
    const chunk = batch.slice(offset, offset + MAX_BATCH)
    const payload = buildBucketPayload(chunk, allTasks, corrections, settings, now)

    try {
      const response = await chat({
        messages: [
          { role: 'system', content: buildBucketSystemPrompt() },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        json: true,
        maxTokens: 512,
      })

      const items = unwrapBucketItems(response.content)
      if (!items) continue

      const decided = normalizeBucket(items, chunk)
      await db.transaction('rw', db.tasks, async () => {
        for (const task of chunk) {
          const hit = decided.get(task.id)
          await db.tasks.update(task.id, {
            bucket: hit ? hit.bucket : 'today',
            bucket_reason: hit ? hit.reason : null,
          })
          updated += 1
        }
      })
    } catch (error) {
      if (import.meta.env.DEV) {
        console.info('[bucket] 失败，留在 today：', error instanceof LlmError ? error.message : error)
      }
    }
  }

  return updated
}
