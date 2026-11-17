import type { DayCapacity, Settings, Weekday } from '../db/db'

export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  1: '周一',
  2: '周二',
  3: '周三',
  4: '周四',
  5: '周五',
  6: '周六',
  7: '周日',
}

/** 周条上的单字标签 */
export const WEEKDAY_BARE: Record<Weekday, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '日',
}

export const WORKDAYS: Weekday[] = [1, 2, 3, 4, 5]

/** JS 的 getDay() 里 0 是周日，这里统一折成 1..7 */
export function weekdayOf(date: Date): Weekday {
  const d = date.getDay()
  return (d === 0 ? 7 : d) as Weekday
}

/** 本地时区的 "YYYY-MM-DD"，不用 toISOString（那是 UTC，会跨天错位） */
export function dateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} 分钟`
  if (m === 0) return `${h} 小时`
  return `${h} 小时 ${m} 分`
}

/** 周条上的紧凑写法：3h / 1.5h / 45m */
export function formatCompact(min: number): string {
  const total = Math.max(0, Math.round(min))
  if (total === 0) return '0'
  if (total < 60) return `${total}m`
  const h = total / 60
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`
}

/** 把任意输入夹到 0–1440 分钟，并对齐到 5 分钟 */
export function clampMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0
  const snapped = Math.round(value / 5) * 5
  return Math.min(1440, Math.max(0, snapped))
}

export interface ResolvedCapacity {
  minutes: number
  /** override = 单日覆盖命中；template = 走周模板 */
  source: 'override' | 'template'
  weekday: Weekday
  key: string
}

/**
 * 规格 3.1 口径：可用(某天) = capacity_override[该天] ?? day_capacity[weekday(该天)]
 */
export function resolveCapacity(settings: Settings, date: Date): ResolvedCapacity {
  const key = dateKey(date)
  const weekday = weekdayOf(date)
  const override = settings.capacity_override[key]
  if (typeof override === 'number') {
    return { minutes: override, source: 'override', weekday, key }
  }
  return { minutes: settings.day_capacity[weekday], source: 'template', weekday, key }
}

/** 今日可用 = 上面的解析函数套在“现在”上，设置页和以后的队列页共用同一个口径 */
export function todayCapacity(settings: Settings, now: Date = new Date()): ResolvedCapacity {
  return resolveCapacity(settings, now)
}

export function formatDateLabel(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function sumWorkdays(capacity: DayCapacity): number {
  return WORKDAYS.reduce((acc, d) => acc + capacity[d], 0)
}
