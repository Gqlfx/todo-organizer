import { useState } from 'react'
import { setDayCapacity } from '../../db/settings'
import type { Settings, Weekday } from '../../db/db'
import {
  WEEKDAYS,
  WEEKDAY_BARE,
  WEEKDAY_LABEL,
  formatCompact,
  formatMinutes,
  weekdayOf,
} from '../../lib/capacity'
import { DayCapacityEditor } from './DayCapacityEditor'
import { Card, SectionTitle } from './ui'

/** 滑杆拖动中的预览值：只影响渲染，松手才写库 */
export interface CapacityPreview {
  day: Weekday
  minutes: number
}

export function WeekCapacity({
  settings,
  preview,
  onPreview,
}: {
  settings: Settings
  preview: CapacityPreview | null
  onPreview: (next: CapacityPreview | null) => void
}) {
  const todayWeekday = weekdayOf(new Date())
  const [selected, setSelected] = useState<Weekday>(todayWeekday)

  // 正在拖的那天显示草稿值，其余天照旧读库——柱子和上方的数字必须是同一个数
  const valueOf = (day: Weekday) =>
    preview && preview.day === day ? preview.minutes : settings.day_capacity[day]

  const values = WEEKDAYS.map(valueOf)
  // 刻度锚在 5 小时：新默认值最大就是 300，锚太高会让七根柱子都缩成一条
  const scale = Math.max(300, ...values)

  return (
    <Card className="mt-3 px-4 pt-3.5 pb-3">
      <SectionTitle title="一周可用时间" hint="点某天单独调" />

      <div className="mt-3 grid grid-cols-7 gap-0.5">
        {WEEKDAYS.map((day) => {
          const minutes = valueOf(day)
          const isSelected = day === selected
          const isToday = day === todayWeekday
          const height = minutes === 0 ? 3 : Math.max(6, Math.round((minutes / scale) * 100))

          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${WEEKDAY_LABEL[day]} ${formatMinutes(minutes)}`}
              onClick={() => setSelected(day)}
              className={`flex flex-col items-center rounded-xl px-0.5 pt-2 pb-1.5 transition ${
                isSelected ? 'bg-accent-soft' : 'active:bg-canvas'
              }`}
            >
              <div className="flex h-[64px] w-full items-end justify-center">
                <div
                  className={`w-[17px] rounded-t-[4px] ${
                    isSelected ? 'bg-accent' : isToday ? 'bg-accent/55' : 'bg-[#cbd3d0]'
                  } transition-[height,background-color] duration-100`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <span
                className={`mt-1.5 text-[11.5px] ${
                  isToday ? 'font-semibold text-ink' : 'text-ink-soft'
                }`}
              >
                {WEEKDAY_BARE[day]}
              </span>
              <span
                className={`text-[10px] tabular-nums ${
                  preview && preview.day === day ? 'text-accent' : 'text-ink-faint'
                }`}
              >
                {formatCompact(minutes)}
              </span>
              <span
                className={`mt-0.5 h-1 w-1 rounded-full ${isToday ? 'bg-accent' : 'bg-transparent'}`}
              />
            </button>
          )
        })}
      </div>

      <div className="mt-2.5">
        <DayCapacityEditor
          key={selected}
          title={WEEKDAY_LABEL[selected]}
          hint={selected >= 6 ? '周模板 · 周末单调' : '周模板'}
          value={settings.day_capacity[selected]}
          onCommit={(minutes) => void setDayCapacity(selected, minutes)}
          onPreview={(minutes) => onPreview(minutes === null ? null : { day: selected, minutes })}
        />
      </div>
    </Card>
  )
}
