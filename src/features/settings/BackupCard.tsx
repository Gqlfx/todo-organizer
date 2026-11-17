import { useRef, useState } from 'react'
import { db } from '../../db/db'
import {
  BackupError,
  exportBackup,
  importBackup,
  lastExportAt,
  readBackupFile,
} from '../../lib/backup'
import { Card, SectionTitle } from './ui'

function formatLast(at: number | null): string {
  if (!at) return '还没导出过'
  const date = new Date(at)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `上次导出 ${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`
}

export function BackupCard() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastAt, setLastAt] = useState<number | null>(() => lastExportAt())
  const inputRef = useRef<HTMLInputElement>(null)

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    try {
      const count = await exportBackup()
      setLastAt(lastExportAt())
      setMessage(`已导出 ${count} 条任务`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导出失败')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const backup = await readBackupFile(file)
      const current = await db.tasks.count()
      const confirmed = window.confirm(
        `会用文件里的 ${backup.data.tasks.length} 条任务替换现有 ${current} 条，不可撤销`,
      )
      if (!confirmed) {
        setMessage('已取消导入')
        return
      }

      const localSettings = await db.settings.get(1)
      await importBackup(backup, localSettings?.ai_key ?? '')
      setMessage(
        `已导入 ${backup.data.tasks.length} 条任务、${backup.data.corrections.length} 条纠正记录`,
      )
    } catch (error) {
      setMessage(error instanceof BackupError ? error.message : '导入失败')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card className="mt-3 px-4 pt-3.5 pb-3">
      <SectionTitle title="备份" hint={formatLast(lastAt)} />

      <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
        导出一个 JSON 文件，含任务、设置和纠正记录。AI key 不写进文件，导入时保留本机原值。
      </p>

      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleExport()}
          className="rounded-lg bg-ink px-2.5 py-1.5 text-[11px] text-white disabled:opacity-40"
        >
          导出 JSON
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-card px-2.5 py-1.5 text-[11px] text-ink-soft ring-1 ring-line disabled:opacity-40"
        >
          导入 JSON
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void handleFile(file)
          }}
        />
      </div>

      {message ? (
        <div className="mt-2 text-[11px] leading-relaxed text-ink-soft">{message}</div>
      ) : null}
    </Card>
  )
}
