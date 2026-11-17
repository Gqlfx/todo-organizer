import type { Bucket, Settings, Task, Weekday } from '../db/db'
import { dateKey, resolveCapacity, weekdayOf } from './capacity'
import { canFit, classifyGap, type GapKind } from './fill'
import { minutesOfDay, parseClock, parseDateTimeValue, weekdayFromKey } from './time'

/** 没写估时的任务按 30 分钟算（v1.0 第六节的第一个默认值） */
export const DEFAULT_EST_MIN = 30

const BUCKET_ORDER: Record<Bucket, number> = { now: 0, today: 1, week: 2, later: 3 }

export interface PlacedTask {
  task: Task
  startMin: number
  endMin: number
  estMin: number
}

export type OverflowReason = 'capacity' | 'no-gap'

export interface OverflowTask {
  task: Task
  reason: OverflowReason
  estMin: number
}

export interface FixedBlock {
  task: Task
  startMin: number
  endMin: number
}

export interface QueueGap {
  startMin: number
  endMin: number
  kind: GapKind
}

export interface QueueResult {
  placed: PlacedTask[]
  overflow: OverflowTask[]
  /** 装填结束后仍然空着的时段：只保留被固定事件夹住的空档，容量排满时为空 */
  gaps: QueueGap[]
  /** 今天真正占用时间的固定段（已裁到今天的窗口内） */
  fixed: FixedBlock[]
  usedMin: number
  capacityMin: number
  /** 最后一件事的结束时刻；一件都没排上时为 null */
  endsAtMin: number | null
  /** 今天该处理的任务数（todo 且非固定，且档位是 now/today） */
  totalToday: number
  /** week 档：今天不装，但也不能从界面上消失（用于底部计数） */
  waitingWeek: Task[]
  /** 排到以后的任务（plan_date > 今天），底部「明天 N 件」用 */
  upcoming: Task[]
  /** 今天已经完成的（done_at 落在今天） */
  completedToday: Task[]
  /** 是否撞到了当天可用容量 */
  exhausted: boolean
}

function estOf(task: Task): number {
  const value = task.est_min
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.round(value)
  return DEFAULT_EST_MIN
}

function dueValue(task: Task): number {
  const parsed = parseDateTimeValue(task.due_at)
  if (!parsed || !parsed.dateKey) return Number.POSITIVE_INFINITY
  const [y, m, d] = parsed.dateKey.split('-').map(Number)
  return new Date(y, m - 1, d, Math.floor(parsed.minutes / 60), parsed.minutes % 60).getTime()
}

/** ISO 时间戳 → 本地日期键 */
function dayOfISO(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return dateKey(date)
}

/** 顺延/固定事件都可能进「之后」，用日期排序与显示 */
export function upcomingDateOf(task: Task): string {
  if (task.plan_date) return task.plan_date
  return parseDateTimeValue(task.start_at)?.dateKey ?? ''
}

/**
 * 顺延的目标日：从明天起最多往后找 7 天，取第一个「已有计划量 + 这条」不超过当天容量的日子。
 * 7 天都装不下就放到第 7 天——不无限往后推，也不因为排不下就留在今天。
 */
export function nextFittingDate(task: Task, tasks: Task[], settings: Settings, from: Date): string {
  const est = estOf(task)

  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset)
    const key = dateKey(day)
    const capacity = Math.max(0, resolveCapacity(settings, day).minutes)
    const load = tasks.reduce((sum, item) => {
      if (item.status !== 'todo' || item.is_fixed || item.id === task.id) return sum
      return item.plan_date === key ? sum + estOf(item) : sum
    }, 0)
    if (load + est <= capacity) return key
  }

  const fallback = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 7)
  return dateKey(fallback)
}

/**
 * 排序：档位 now > today > week > later → 组内 due_at 升序（null 最后）
 * → est_min 升序 → created_at 升序（同批录入保持输入顺序）。
 */
export function compareTasks(a: Task, b: Task): number {
  const byBucket = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket]
  if (byBucket !== 0) return byBucket

  const dueA = dueValue(a)
  const dueB = dueValue(b)
  if (dueA !== dueB) return dueA - dueB

  const estA = estOf(a)
  const estB = estOf(b)
  if (estA !== estB) return estA - estB

  const createdA = Date.parse(a.created_at) || 0
  const createdB = Date.parse(b.created_at) || 0
  if (createdA !== createdB) return createdA - createdB

  return a.id.localeCompare(b.id)
}

/** 这条固定事件今不今天出现：weekly 看星期几，其余看日期；只有时间的当今天 */
export function occursOn(task: Task, todayKey: string, todayWeekday: Weekday): boolean {
  const start = parseDateTimeValue(task.start_at)
  if (!start) return false
  if (!start.dateKey) return true
  if (task.repeat === 'weekly') return weekdayFromKey(start.dateKey) === todayWeekday
  return start.dateKey === todayKey
}

/**
 * Day 3-4 的核心：纯函数算出一条今天能执行的队列。
 * 不碰 IndexedDB、不碰 React、不调 AI —— 同样的输入永远同样的输出。
 */
export function computeQueue(tasks: Task[], settings: Settings, now: Date): QueueResult {
  const todayKey = dateKey(now)
  const todayWeekday = weekdayOf(now)
  const nowMin = minutesOfDay(now)

  const workStart = parseClock(settings.work_start) ?? 8 * 60
  const workEnd = parseClock(settings.work_end) ?? 23 * 60
  const windowStart = Math.max(nowMin, workStart)
  const windowEnd = Math.max(windowStart, workEnd)

  const capacityMin = Math.max(0, resolveCapacity(settings, now).minutes)
  const buffer = Math.max(0, settings.buffer_min)
  const minGap = Math.max(0, settings.min_gap_min)

  const fixedDrafts: Array<{
    task: Task
    startMin: number
    explicitEndMin: number | null
    estMin: number
  }> = []
  const candidates: Task[] = []
  const waitingWeek: Task[] = []
  const upcoming: Task[] = []
  const completedToday: Task[] = []

  for (const task of tasks) {
    if (task.status === 'done') {
      if (dayOfISO(task.done_at) === todayKey) completedToday.push(task)
      continue
    }
    if (task.status !== 'todo') continue

    if (task.is_fixed) {
      const start = parseDateTimeValue(task.start_at)

      if (start) {
        if (occursOn(task, todayKey, todayWeekday)) {
          /**
           * 结束时刻兜底放在这里，而不是解析层：
           * 手建的固定事件同样可能没有 end_at，入口挡不住；computeQueue 是所有卡片的必经之路。
           * 有明确结束就用；没有（或早于开始）就按 est_min，再缺就 60 分钟。
           */
          const end = parseDateTimeValue(task.end_at)
          const est = task.est_min && task.est_min > 0 ? Math.round(task.est_min) : 60

          fixedDrafts.push({
            task,
            startMin: start.minutes,
            explicitEndMin: end && end.minutes > start.minutes ? end.minutes : null,
            estMin: est,
          })
          continue
        }

        // 不是今天的固定事件：未来的放进「之后」，过去的直接不管（已经结束）。
        // 不这么做的话，解析出「下周三开会」会让这张卡当场从队列消失。
        if (start.dateKey && start.dateKey > todayKey) upcoming.push(task)
        continue
      }

      // 连开始时刻都没有：不 continue，降级成普通任务走下面的软任务流程。
      // 固定事件缺字段很常见（AI 解析漏、手建漏），丢卡片是最差的处理。
    }

    // plan_date：null = 今天；<= 今天（含逾期）都进今天的队列
    if (task.plan_date !== null && task.plan_date > todayKey) {
      upcoming.push(task)
      continue
    }

    // v1.0 §3.3：只有 later 不占今天容量
    if (task.bucket === 'later') continue

    // week 档也不装进今天，但不能就这么消失：
    // 「全部」Tab 还没做，界面上再没有它的位置，任务就真的丢了。
    // 先只带回调用方，用于底部「还有 K 件没排上」的计数。
    if (task.bucket === 'week') {
      waitingWeek.push(task)
      continue
    }

    candidates.push(task)
  }

  upcoming.sort((a, b) => {
    const dateA = upcomingDateOf(a)
    const dateB = upcomingDateOf(b)
    if (dateA !== dateB) return dateA < dateB ? -1 : 1
    return compareTasks(a, b)
  })

  completedToday.sort((a, b) => (Date.parse(b.done_at ?? '') || 0) - (Date.parse(a.done_at ?? '') || 0))

  fixedDrafts.sort((a, b) => a.startMin - b.startMin)

  const fixed: FixedBlock[] = fixedDrafts.map((draft, index) => {
    if (draft.explicitEndMin !== null) {
      return { task: draft.task, startMin: draft.startMin, endMin: draft.explicitEndMin }
    }

    // 兜底出来的时长不许吞掉下一个固定事件（连它的 buffer 一起让开）
    const nextStart = fixedDrafts.slice(index + 1).find((item) => item.startMin > draft.startMin)
      ?.startMin
    const fallbackEnd = draft.startMin + draft.estMin
    const capped =
      nextStart === undefined ? fallbackEnd : Math.min(fallbackEnd, nextStart - buffer)

    // 夹完如果已经不比开始晚（两个事件挨得比 buffer 还近），贴着下一个事件的开始时刻收，
    // 否则会出现零长度甚至负长度的固定段。
    const endMin =
      capped > draft.startMin
        ? capped
        : nextStart !== undefined && nextStart > draft.startMin
          ? nextStart
          : fallbackEnd

    return { task: draft.task, startMin: draft.startMin, endMin }
  })

  // 固定事件前后各留 buffer，再与今天的窗口求交集
  const busy = fixed
    .map((block) => ({
      start: block.startMin - buffer,
      end: Math.min(block.endMin + buffer, windowEnd),
    }))
    .filter((block) => block.end > windowStart && block.start < windowEnd)
    .sort((a, b) => a.start - b.start)

  const gaps: QueueGap[] = []
  let cursor = windowStart
  for (const block of busy) {
    const start = Math.max(block.start, windowStart)
    const end = Math.min(block.end, windowEnd)
    if (end <= cursor) continue
    if (start > cursor) {
      gaps.push({ startMin: cursor, endMin: start, kind: classifyGap(start - cursor, minGap) })
    }
    cursor = Math.max(cursor, end)
  }
  if (cursor < windowEnd) {
    gaps.push({ startMin: cursor, endMin: windowEnd, kind: classifyGap(windowEnd - cursor, minGap) })
  }

  const ordered = [...candidates].sort(compareTasks)
  const placed: PlacedTask[] = []
  const overflow: OverflowTask[] = []
  const pending: Task[] = []
  let usedMin = 0
  let exhausted = false

  const take = (gap: QueueGap, task: Task, estMin: number): void => {
    placed.push({ task, startMin: gap.startMin, endMin: gap.startMin + estMin, estMin })
    gap.startMin += estMin
    gap.kind = classifyGap(gap.endMin - gap.startMin, minGap)
    usedMin += estMin
  }

  // 第一轮：按序装整块，放不下跳到下一个整块
  for (const task of ordered) {
    const est = estOf(task)
    if (usedMin + est > capacityMin) {
      exhausted = true
      overflow.push({ task, reason: 'capacity', estMin: est })
      continue
    }
    const gap = gaps.find(
      (candidate) =>
        candidate.kind === 'block' && canFit(candidate.kind, candidate.endMin - candidate.startMin, est),
    )
    if (!gap) {
      pending.push(task)
      continue
    }
    take(gap, task, est)
  }

  // 第二轮：剩下的短任务回填碎片（10 分钟的取快递必须能塞进去）
  for (const task of pending) {
    const est = estOf(task)
    if (usedMin + est > capacityMin) {
      exhausted = true
      overflow.push({ task, reason: 'capacity', estMin: est })
      continue
    }
    const gap = gaps.find((candidate) =>
      canFit(candidate.kind, candidate.endMin - candidate.startMin, est),
    )
    if (!gap) {
      overflow.push({ task, reason: 'no-gap', estMin: est })
      continue
    }
    take(gap, task, est)
  }

  placed.sort((a, b) => a.startMin - b.startMin)

  const lastEnd = placed.length
    ? placed.reduce((max, item) => Math.max(max, item.endMin), placed[0].endMin)
    : windowStart

  /**
   * 空档线只描述「被固定事件夹住」的空档：
   * - 末尾那段（一直空到 work_end）不画 —— 那段时间归容量预算管，不是空档
   * - 容量已经排满时一条都不画 —— 否则「今天到此为止」上面还挂着「空档 1.5 小时」
   */
  const visibleGaps = exhausted
    ? []
    : gaps.filter((gap) => gap.kind !== 'dropped' && gap.endMin < windowEnd)

  return {
    placed,
    overflow,
    gaps: visibleGaps,
    fixed: fixed.filter((block) => block.endMin > windowStart && block.startMin < windowEnd),
    usedMin,
    capacityMin,
    endsAtMin: placed.length ? lastEnd : null,
    totalToday: candidates.length,
    waitingWeek,
    upcoming,
    completedToday,
    exhausted,
  }
}
