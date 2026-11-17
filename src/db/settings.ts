import { useLiveQuery } from 'dexie-react-hooks'
import {
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  db,
  type DayCapacity,
  type Settings,
  type Weekday,
} from './db'
import { WEEKDAYS, WORKDAYS, clampMinutes, dateKey } from '../lib/capacity'

/**
 * 读设置；库是空的就写入默认值。
 * 顺带清掉已经过去的 capacity_override：那天的覆盖永远不会再被读到，
 * 留着只会在页面上变成看不见的脏数据（界面只允许改“今天”）。
 */
export async function loadSettings(): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const existing = await db.settings.get(SETTINGS_ID)
    if (!existing) {
      await db.settings.put({ ...DEFAULT_SETTINGS, day_capacity: { ...DEFAULT_SETTINGS.day_capacity } })
      return DEFAULT_SETTINGS
    }

    const overrides = existing.capacity_override ?? {}
    const today = dateKey(new Date())
    const kept = Object.fromEntries(Object.entries(overrides).filter(([key]) => key >= today))
    if (Object.keys(kept).length === Object.keys(overrides).length) return existing

    await db.settings.update(SETTINGS_ID, { capacity_override: kept })
    return { ...existing, capacity_override: kept }
  })
}

/** 唯一的订阅入口：任何一次写库都会让页面重算，不需要手动刷新 */
export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get(SETTINGS_ID), [])
}

/** 读-改-写在同一个事务里，避免两个控件先后落库时互相覆盖 */
async function mutate(recipe: (current: Settings) => Partial<Settings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await db.settings.get(SETTINGS_ID)
    if (!current) return
    const patch = recipe(current)
    if (Object.keys(patch).length === 0) return
    await db.settings.update(SETTINGS_ID, patch)
  })
}

export async function setDayCapacity(weekday: Weekday, minutes: number): Promise<void> {
  const value = clampMinutes(minutes)
  await mutate((current) => ({
    day_capacity: { ...current.day_capacity, [weekday]: value },
  }))
}

/** 预设按钮：一次写入周一至周五，周六周日保持原值 */
export async function setWorkdayCapacity(minutes: number): Promise<void> {
  const value = clampMinutes(minutes)
  await mutate((current) => {
    const next: DayCapacity = { ...current.day_capacity }
    for (const day of WORKDAYS) next[day] = value
    return { day_capacity: next }
  })
}

/** 整块回写一份周模板（用于预设的撤销） */
export async function replaceDayCapacity(dayCapacity: DayCapacity): Promise<void> {
  await mutate(() => {
    const next = { ...dayCapacity }
    for (const day of WEEKDAYS) next[day] = clampMinutes(dayCapacity[day])
    return { day_capacity: next }
  })
}

export async function setCapacityOverride(dateISO: string, minutes: number): Promise<void> {
  const value = clampMinutes(minutes)
  await mutate((current) => ({
    capacity_override: { ...current.capacity_override, [dateISO]: value },
  }))
}

export async function clearCapacityOverride(dateISO: string): Promise<void> {
  await mutate((current) => {
    if (!(dateISO in current.capacity_override)) return {}
    const next = { ...current.capacity_override }
    delete next[dateISO]
    return { capacity_override: next }
  })
}

export async function updateScalars(
  patch: Partial<Pick<Settings, 'work_start' | 'work_end' | 'buffer_min' | 'min_gap_min'>>,
): Promise<void> {
  await mutate(() => patch)
}

/**
 * 原生打包后没有 Vite proxy，模型请求直连，key 必须存在本机。
 * 只存 IndexedDB，不上传；导出备份时会写成空字符串（见 backup.ts）。
 */
export async function setAiKey(key: string): Promise<void> {
  await mutate(() => ({ ai_key: key.trim() }))
}
