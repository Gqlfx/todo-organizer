import { useEffect, useState } from 'react'
import type { Settings } from '../../db/db'
import { updateScalars } from '../../db/settings'
import { clearProbeTasks, useTaskCount, writeProbeTask } from '../../db/selfCheck'
import { BLOCK_MIN, FRAGMENT_MIN } from '../../lib/fill'

function MinuteField({
  value,
  onCommit,
  max = 240,
  label,
}: {
  value: number
  onCommit: (next: number) => void
  max?: number
  label: string
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(0, Math.round(parsed)))
    setDraft(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return (
    <div className="flex items-center gap-1">
      <input
        inputMode="numeric"
        aria-label={label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        className="h-8 w-14 rounded-lg border border-line bg-card px-2 text-right text-[12px] tabular-nums"
      />
      <span className="text-[11px] text-ink-faint">分钟</span>
    </div>
  )
}

function TimeField({
  value,
  onCommit,
  label,
}: {
  value: string
  onCommit: (next: string) => void
  label: string
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(event) => {
        if (event.target.value) onCommit(event.target.value)
      }}
      className="h-8 rounded-lg border border-line bg-card px-2 text-[12px] tabular-nums"
    />
  )
}

export function MoreSettings({ settings }: { settings: Settings }) {
  const [open, setOpen] = useState(false)
  const taskCount = useTaskCount()
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const probe = async () => {
    setBusy(true)
    try {
      const task = await writeProbeTask()
      setMessage(`读回成功：${task.title} · ${task.status} · ${task.est_min} 分钟`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '写入失败')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      const removed = await clearProbeTasks()
      setMessage(`已清除 ${removed} 条测试任务`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <details
      className="mt-3 rounded-2xl border border-line bg-card"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div>
          <div className="text-[13px] font-semibold">更多设置</div>
          <div className="mt-0.5 text-[11px] text-ink-faint">工作时间 · 缓冲 · 本地数据</div>
        </div>
        <span className="text-[11px] text-ink-faint">{open ? '收起' : '展开'}</span>
      </summary>

      <div className="space-y-3 border-t border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-soft">一天的范围</span>
          <div className="flex items-center gap-1.5">
            <TimeField
              label="开始时间"
              value={settings.work_start}
              onCommit={(next) => void updateScalars({ work_start: next })}
            />
            <span className="text-[11px] text-ink-faint">至</span>
            <TimeField
              label="结束时间"
              value={settings.work_end}
              onCommit={(next) => void updateScalars({ work_end: next })}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-soft">固定占用之间留缓冲</span>
          <MinuteField
            label="缓冲分钟"
            value={settings.buffer_min}
            max={120}
            onCommit={(next) => void updateScalars({ buffer_min: next })}
          />
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] text-ink-soft">空档阈值</span>
            <MinuteField
              label="最小空档分钟"
              value={settings.min_gap_min}
              max={120}
              onCommit={(next) => void updateScalars({ min_gap_min: next })}
            />
          </div>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-faint">
            小于 {FRAGMENT_MIN} 分钟丢弃；{FRAGMENT_MIN}–{BLOCK_MIN} 分钟只放短任务；
            ≥ {BLOCK_MIN} 分钟算整块。
          </p>
        </div>

        <div className="rounded-xl bg-canvas px-3 py-2.5">
          <div className="text-[12px] font-medium">本地数据自检</div>
          <div className="mt-0.5 text-[11px] text-ink-faint">
            Task 表 {taskCount ?? '—'} 条 · 两张表都写在 IndexedDB
          </div>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void probe()}
              className="flex-1 rounded-lg bg-ink px-2.5 py-1.5 text-[11px] whitespace-nowrap text-white disabled:opacity-40"
            >
              写一条测试任务
            </button>
            <button
              type="button"
              disabled={busy || !taskCount}
              onClick={() => void clear()}
              className="rounded-lg bg-card px-3 py-1.5 text-[11px] whitespace-nowrap text-ink-soft ring-1 ring-line disabled:opacity-40"
            >
              清除
            </button>
          </div>
          {message ? (
            <div className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">{message}</div>
          ) : null}
        </div>
      </div>
    </details>
  )
}
