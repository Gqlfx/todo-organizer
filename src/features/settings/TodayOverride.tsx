import type { Settings } from '../../db/db'
import { clearCapacityOverride, setCapacityOverride } from '../../db/settings'
import { WEEKDAY_LABEL, dateKey, formatMinutes, weekdayOf } from '../../lib/capacity'
import { DayCapacityEditor } from './DayCapacityEditor'
import { Card, Switch } from './ui'

export function TodayOverride({ settings }: { settings: Settings }) {
  const now = new Date()
  const key = dateKey(now)
  const weekday = weekdayOf(now)

  const override = settings.capacity_override[key]
  const enabled = typeof override === 'number'
  const template = settings.day_capacity[weekday]
  const current = enabled ? override : template

  return (
    <Card className="mt-3 px-4 pt-3.5 pb-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold">今天特殊</div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            临时有空 / 没空，只盖今天这一层，周模板不动
          </p>
        </div>
        <Switch
          checked={enabled}
          label="今天特殊"
          onChange={(next) => {
            if (next) void setCapacityOverride(key, current)
            else void clearCapacityOverride(key)
          }}
        />
      </div>

      {enabled ? (
        <div className="mt-3">
          <DayCapacityEditor
            key={`override-${key}`}
            title="今天实际可用"
            hint="覆盖值"
            value={current}
            tone="warn"
            onCommit={(minutes) => void setCapacityOverride(key, minutes)}
          />
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-ink-faint">
            <span>
              平时的{WEEKDAY_LABEL[weekday]}：{formatMinutes(template)}
            </span>
            <button
              type="button"
              onClick={() => void clearCapacityOverride(key)}
              className="font-medium text-accent"
            >
              恢复常规
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
          正在按{WEEKDAY_LABEL[weekday]}常规 {formatMinutes(current)} 算。今天要是不一样，打开上面的开关。
        </p>
      )}
    </Card>
  )
}
