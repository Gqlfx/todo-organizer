import { Capacitor } from '@capacitor/core'
import {
  DEFAULT_SETTINGS,
  SETTINGS_ID,
  db,
  type Correction,
  type Settings,
  type Task,
} from '../db/db'

/**
 * 本地备份：导出整个库（tasks / settings / corrections）成一个 JSON 文件。
 * 导入是覆盖式：先清空三张表再写，不做合并——合并的冲突规则比功能本身还复杂。
 * ai_key 永远不进文件，导入时也保留本机原值。
 */

export const BACKUP_APP = 'todo-organizer'
const LAST_EXPORT_KEY = 'todo.lastExportAt'
const DAY_MS = 24 * 60 * 60 * 1000
const REMIND_AFTER_DAYS = 7
const OLD_AFTER_DAYS = 30

export interface BackupFile {
  app: string
  version: number
  exportedAt: string
  data: {
    tasks: Task[]
    settings: Settings
    corrections: Correction[]
  }
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupError'
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** "2026-11-17T16:00:00+08:00"（带本地时区偏移，不用 Z） */
export function localIsoWithOffset(date: Date): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const hours = pad(Math.floor(Math.abs(offset) / 60))
  const minutes = pad(Math.abs(offset) % 60)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${hours}:${minutes}`
  )
}

export function backupFilename(date: Date = new Date()): string {
  return `todo-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

export async function buildBackup(): Promise<BackupFile> {
  const [tasks, settings, corrections] = await Promise.all([
    db.tasks.toArray(),
    db.settings.get(SETTINGS_ID),
    db.corrections.toArray(),
  ])

  return {
    app: BACKUP_APP,
    version: db.verno,
    exportedAt: localIsoWithOffset(new Date()),
    data: {
      tasks,
      // 导出的 settings 永远不带 key
      settings: { ...(settings ?? DEFAULT_SETTINGS), ai_key: '' },
      corrections,
    },
  }
}

function triggerDownload(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * 交付备份文件。两条路：
 * - 浏览器：Blob + `<a download>`
 * - 原生：写进 app 缓存目录，再交给系统分享面板（存到文件 / 发给自己 / 传网盘）
 *
 * 原生为什么不用 Documents：Android 11+ 的公共 Documents 需要
 * MANAGE_EXTERNAL_STORAGE，普通应用写不进去。Cache 是私有目录、零权限，
 * 用户通过分享面板决定最终落到哪。
 */
async function deliverBackup(filename: string, text: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    triggerDownload(filename, text)
    return
  }

  // 插件按需加载：浏览器包里不该为两个原生插件付体积
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ])

  const written = await Filesystem.writeFile({
    path: filename,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  try {
    await Share.share({ title: filename, files: [written.uri], dialogTitle: '保存备份' })
  } catch {
    // 用户取消分享不算失败：文件已经写好，只是没选去处
  }
}

export function markExported(at: Date = new Date()): void {
  try {
    localStorage.setItem(LAST_EXPORT_KEY, at.toISOString())
  } catch {
    // localStorage 被禁用时忽略：提醒会一直显示，但导出本身已经成功
  }
}

export function lastExportAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_EXPORT_KEY)
    if (!raw) return null
    const value = Date.parse(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

export interface ExportReminder {
  /** 距上次导出的整天数；从没导出过是 null */
  days: number | null
  label: string
}

/** 距上次导出的整天数；从没导出过返回 null */
export function daysSinceExport(now: Date = new Date()): number | null {
  const last = lastExportAt()
  if (last === null) return null
  return Math.max(0, Math.floor((now.getTime() - last) / DAY_MS))
}

/**
 * 7 天以内不提醒；7–29 天写实际天数；30 天以上写「一个多月」——
 * 拖到那么久以后，精确天数已经没人信了，还不如给个量级。
 */
export function exportReminder(now: Date = new Date()): ExportReminder | null {
  const last = lastExportAt()
  if (last === null) return { days: null, label: '还没备份过' }

  const days = daysSinceExport(now) ?? 0
  if (days < REMIND_AFTER_DAYS) return null
  if (days >= OLD_AFTER_DAYS) return { days, label: '一个多月没备份' }
  return { days, label: `${days} 天没备份` }
}

/** 导出并触发下载，返回任务条数 */
export async function exportBackup(): Promise<number> {
  const backup = await buildBackup()
  await deliverBackup(backupFilename(), `${JSON.stringify(backup, null, 2)}\n`)
  markExported()
  return backup.data.tasks.length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await file.text())
  } catch {
    throw new BackupError('文件不是合法 JSON')
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP) {
    throw new BackupError('不是本应用的备份文件')
  }

  const version = Number(parsed.version)
  if (!Number.isFinite(version)) throw new BackupError('文件缺少版本号')
  if (version > db.verno) {
    throw new BackupError(`文件版本 v${version} 高于当前 v${db.verno}，请先升级应用`)
  }

  const data = parsed.data
  if (!isRecord(data)) throw new BackupError('文件缺少 data')
  if (!Array.isArray(data.tasks)) throw new BackupError('data.tasks 不是数组')
  if (!isRecord(data.settings)) throw new BackupError('data.settings 缺失')

  const tasks = data.tasks as Task[]
  for (const task of tasks) {
    if (!isRecord(task) || typeof task.id !== 'string' || typeof task.title !== 'string') {
      throw new BackupError('data.tasks 里有格式不对的条目')
    }
  }

  return {
    app: BACKUP_APP,
    version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    data: {
      tasks: tasks.map((task) => ({ ...task, plan_date: task.plan_date ?? null })),
      settings: data.settings as unknown as Settings,
      corrections: Array.isArray(data.corrections) ? (data.corrections as Correction[]) : [],
    },
  }
}

/** 覆盖式导入；aiKey 传本机当前值，文件里的 key 一律忽略 */
export async function importBackup(backup: BackupFile, aiKey: string): Promise<void> {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...backup.data.settings,
    id: SETTINGS_ID,
    ai_key: aiKey,
  }

  await db.transaction('rw', db.tasks, db.settings, db.corrections, async () => {
    await Promise.all([db.tasks.clear(), db.corrections.clear(), db.settings.clear()])
    if (backup.data.tasks.length > 0) await db.tasks.bulkAdd(backup.data.tasks)
    await db.settings.put(settings)
    if (backup.data.corrections.length > 0) await db.corrections.bulkAdd(backup.data.corrections)
  })
}
