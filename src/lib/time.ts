import type { Weekday } from '../db/db'

/** 一天内的分钟数（0–1439） */
export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** 480 → "08:00" */
export function formatClock(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** "08:00" → 480；格式不对返回 null */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** 空档线用：90 → "1.5 小时"，45 → "45 分钟" */
export function formatHours(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  if (total < 60) return `${total} 分钟`
  const hours = total / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
}

/** "2026-11-18" → "11-18" */
export function formatMonthDay(key: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return key
  return `${match[2]}-${match[3]}`
}

export interface ParsedDateTime {
  /** 只有 "HH:mm" 时为 null，表示“今天” */
  dateKey: string | null
  minutes: number
}

/**
 * 固定事件的起止时间目前没有录入 UI，所以解析要宽松：
 * 接受 "14:00" / "2026-11-16T14:00" / "2026-11-16 14:00" / "2026-11-16"。
 */
export function parseDateTimeValue(value: string | null | undefined): ParsedDateTime | null {
  if (!value) return null
  const text = value.trim()

  if (/^\d{1,2}:\d{2}$/.test(text)) {
    const minutes = parseClock(text)
    return minutes === null ? null : { dateKey: null, minutes }
  }

  const full = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(text)
  if (full) {
    const minutes = Number(full[4]) * 60 + Number(full[5])
    if (minutes > 1439) return null
    return { dateKey: `${full[1]}-${full[2]}-${full[3]}`, minutes }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { dateKey: text, minutes: 0 }
  }

  return null
}

/** "2026-11-16" → 1..7（不经过 UTC，避免时区把周日算成周一） */
export function weekdayFromKey(key: string): Weekday | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const day = date.getDay()
  return (day === 0 ? 7 : day) as Weekday
}
