import { useEffect, useRef, useState } from 'react'
import type { DayCapacity } from '../../db/db'
import { replaceDayCapacity, setWorkdayCapacity } from '../../db/settings'
import { WORKDAYS } from '../../lib/capacity'
import { Card, SectionTitle } from './ui'

const PRESETS = [
  { minutes: 120, label: '紧张', text: '2h' },
  { minutes: 240, label: '正常', text: '4h' },
  { minutes: 360, label: '宽裕', text: '6h' },
  { minutes: 600, label: '全天', text: '10h' },
]

const UNDO_WINDOW_MS = 8000

export function PresetBar({ dayCapacity }: { dayCapacity: DayCapacity }) {
  const [undo, setUndo] = useState<{ previous: DayCapacity; message: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) window.clearTimeout(timer.current)
    }
  }, [])

  const apply = async (minutes: number, label: string) => {
    const previous = { ...dayCapacity }
    await setWorkdayCapacity(minutes)
    setUndo({ previous, message: `工作日已设为 ${label}` })
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS)
  }

  const handleUndo = async () => {
    if (!undo) return
    if (timer.current !== undefined) window.clearTimeout(timer.current)
    await replaceDayCapacity(undo.previous)
    setUndo(null)
  }

  return (
    <>
      <Card className="mt-3 px-4 pt-3.5 pb-3">
        <SectionTitle title="工作日预设" hint="一键套用到周一至周五" />

        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {PRESETS.map((preset) => {
            const active = WORKDAYS.every((day) => dayCapacity[day] === preset.minutes)
            return (
              <button
                key={preset.minutes}
                type="button"
                aria-pressed={active}
                onClick={() => void apply(preset.minutes, `${preset.text}（${preset.label}）`)}
                className={`flex flex-col items-center gap-0.5 rounded-xl py-2.5 transition active:scale-[0.98] ${
                  active
                    ? 'bg-accent-soft text-accent ring-1 ring-accent/35'
                    : 'bg-card text-ink ring-1 ring-line'
                }`}
              >
                <span className="text-[12px] font-medium">{preset.label}</span>
                <span
                  className={`text-[11px] tabular-nums ${active ? 'text-accent/80' : 'text-ink-faint'}`}
                >
                  {preset.text}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
          周六周日不受影响，在上面点“六 / 日”单独调。
        </p>
      </Card>

      {undo ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-20 flex justify-center px-4">
          <div
            role="status"
            className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink px-4 py-2 text-[12px] text-white shadow-lg"
          >
            <span>{undo.message}</span>
            <button
              type="button"
              onClick={() => void handleUndo()}
              className="font-medium text-[#9fe3d5]"
            >
              撤销
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
