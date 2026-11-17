import { useState } from 'react'
import type { Settings } from '../../db/db'
import { AiKeyCard } from './AiKeyCard'
import { BackupCard } from './BackupCard'
import { MoreSettings } from './MoreSettings'
import { PresetBar } from './PresetBar'
import { TodayCard } from './TodayCard'
import { TodayOverride } from './TodayOverride'
import { WeekCapacity, type CapacityPreview } from './WeekCapacity'

export function SettingsPage({ settings }: { settings: Settings }) {
  /**
   * 滑杆拖动中的预览值。提到这一层是因为柱状图和顶部「今日可用」必须同时跟着动：
   * 只让柱子动、大数字不动，同一屏里两个数会打架。
   */
  const [preview, setPreview] = useState<CapacityPreview | null>(null)

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pt-5 pb-4">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-[20px] font-semibold tracking-tight">设置</h1>
          <span className="text-[11px] text-ink-faint">改完立刻存本机</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-soft">容量按天算——七天七个值，不是一个数字。</p>
      </header>

      <TodayCard settings={settings} preview={preview} />
      <WeekCapacity settings={settings} preview={preview} onPreview={setPreview} />
      <PresetBar dayCapacity={settings.day_capacity} />
      <TodayOverride settings={settings} />
      <MoreSettings settings={settings} />
      <AiKeyCard settings={settings} />
      <BackupCard />

      <p className="mt-6 text-center text-[11px] leading-relaxed text-ink-faint">
        容量和空档阈值直接决定队列怎么排。
        <br />
        改完立刻生效，不用保存。
      </p>
    </main>
  )
}
