import type { CSSProperties } from 'react'
import { formatMinutes } from '../../lib/capacity'
import { useDraftNumber } from '../../lib/useDraftNumber'
import { Chip, Stepper } from './ui'

const QUICK_VALUES = [60, 120, 180, 240, 360, 480]

export function DayCapacityEditor({
  title,
  hint,
  value,
  onCommit,
  onPreview,
  max = 720,
  tone = 'accent',
}: {
  title: string
  hint?: string
  value: number
  onCommit: (minutes: number) => void
  /** 拖动中的值，让外层（柱状图 / 今日可用）实时跟着动；松手并落库后传 null */
  onPreview?: (minutes: number | null) => void
  max?: number
  tone?: 'accent' | 'warn'
}) {
  const { display, set, flush } = useDraftNumber(value, onCommit, onPreview)

  const pick = (next: number) => {
    set(next)
    flush()
  }

  const warn = tone === 'warn'

  return (
    <div
      className={`rounded-xl p-3 ${warn ? 'bg-warn-soft' : 'bg-canvas'}`}
      style={{ '--range-accent': warn ? '#9a5b12' : '#14695c' } as CSSProperties}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[13px] font-medium">{title}</span>
          {hint ? (
            <span className={`text-[11px] ${warn ? 'text-warn/75' : 'text-ink-faint'}`}>{hint}</span>
          ) : null}
        </div>
        <span
          className={`text-[13px] font-medium tabular-nums ${warn ? 'text-warn' : 'text-ink-soft'}`}
        >
          {formatMinutes(display)}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={max}
        step={15}
        value={display}
        aria-label={`${title}可用分钟数`}
        onChange={(event) => set(Number(event.target.value))}
        onPointerUp={flush}
        onKeyUp={flush}
        onBlur={flush}
        className="mt-1.5 w-full"
      />

      <div className="mt-1 flex items-center justify-between">
        <Stepper value={display} step={15} max={max} onChange={pick} label={title} />
        <span className={`text-[11px] ${warn ? 'text-warn/70' : 'text-ink-faint'}`}>
          {warn ? '只覆盖今天' : '按 15 分钟调'}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-6 gap-1">
        {QUICK_VALUES.map((minutes) => (
          <Chip
            key={minutes}
            tone={tone}
            active={display === minutes}
            onClick={() => pick(minutes)}
          >
            {minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`}
          </Chip>
        ))}
      </div>
    </div>
  )
}
