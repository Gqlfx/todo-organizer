import type { Settings } from '../../db/db'
import { WEEKDAY_LABEL, formatDateLabel, formatMinutes, todayCapacity } from '../../lib/capacity'
import { Card } from './ui'
import type { CapacityPreview } from './WeekCapacity'

export function TodayCard({
  settings,
  preview,
}: {
  settings: Settings
  preview: CapacityPreview | null
}) {
  const now = new Date()
  const resolved = todayCapacity(settings, now)

  // 正在拖的正好是今天、且今天没被单独覆盖 → 跟草稿走，让大数字和柱子一起动。
  // 今天有覆盖时不跟周模板走：覆盖优先是 resolveCapacity 的既定口径。
  const total =
    preview && preview.day === resolved.weekday && resolved.source === 'template'
      ? preview.minutes
      : resolved.minutes

  const hours = Math.floor(total / 60)
  const minutes = total % 60
  const isOverride = resolved.source === 'override'
  // 不足一小时就别摆出「0 小时 45 分」：拖动时这个 0 一直挂着，看着像坏了
  const showHours = total === 0 || total >= 60

  const sourceText = isOverride
    ? `覆盖了${WEEKDAY_LABEL[resolved.weekday]}常规的 ${formatMinutes(
        settings.day_capacity[resolved.weekday],
      )}`
    : `${WEEKDAY_LABEL[resolved.weekday]}常规 · 每天单独算`

  return (
    <Card className="mt-4 px-4 pt-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-medium tracking-[0.08em] text-ink-faint">今日可用</div>
          <div className="mt-1.5 flex items-baseline gap-1">
            {showHours ? (
              <>
                <span className="text-[38px] leading-none font-semibold tracking-tight tabular-nums">
                  {hours}
                </span>
                <span className="text-[13px] text-ink-soft">小时</span>
              </>
            ) : null}
            {minutes > 0 || !showHours ? (
              <>
                <span
                  className={`leading-none font-semibold tracking-tight tabular-nums ${
                    showHours ? 'ml-1 text-[25px]' : 'text-[38px]'
                  }`}
                >
                  {minutes}
                </span>
                <span className="text-[13px] text-ink-soft">分</span>
              </>
            ) : null}
          </div>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
            isOverride ? 'bg-warn-soft text-warn' : 'bg-accent-soft text-accent'
          }`}
        >
          {isOverride ? '今天特殊' : '周模板'}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5 text-[11.5px] text-ink-soft">
        <span className="truncate">
          {formatDateLabel(now)} {WEEKDAY_LABEL[resolved.weekday]}
          <span className="text-ink-faint"> · {sourceText}</span>
        </span>
        <span className="shrink-0 tabular-nums text-ink-faint">
          {settings.work_start}–{settings.work_end}
        </span>
      </div>
    </Card>
  )
}
