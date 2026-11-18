import { useMemo, useState } from 'react'
import type { Settings, Task } from '../../db/db'
import {
  applyParsedItems,
  completeTask,
  createTasksFromLines,
  deferTask,
  pullTaskToToday,
  setFixedEnd,
  uncompleteTask,
  useTasks,
} from '../../db/tasks'
import { computeQueue, nextFittingDate } from '../../lib/queue'
import { parseLines } from '../../lib/parse'
import { exportBackup, exportReminder } from '../../lib/backup'
import { isNative } from '../../lib/llm'
import { assignBucketsByIds } from '../../lib/bucket'
import { dateKey } from '../../lib/capacity'
import { formatClock, formatHours, formatMonthDay, minutesOfDay, parseClock } from '../../lib/time'
import { useNow } from '../../lib/useNow'
import { CaptureBox } from './CaptureBox'
import { QueueList } from './QueueList'

export function QueuePage({ settings }: { settings: Settings }) {
  const tasks = useTasks()
  const now = useNow()
  const result = useMemo(() => computeQueue(tasks ?? [], settings, now), [tasks, settings, now])
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set())
  const [reminder, setReminder] = useState(() => exportReminder())

  /**
   * 「还能排」= 两份预算取小：
   * ① 容量还没排完的部分；② 离 work_end 还剩多少时间。
   * 不取小的话，晚上 11 点页面还会说「还能排 1 小时」。
   */
  const workEndMin = parseClock(settings.work_end) ?? 23 * 60
  const minutesLeftToday = workEndMin - minutesOfDay(now)
  const capacityLeft = result.capacityMin - result.usedMin
  const remainingMin = Math.max(0, Math.min(capacityLeft, minutesLeftToday))

  /**
   * 22:58 时离 work_end 只剩 2 分钟：连一个碎片都放不下。
   * 这时候再写「今天还能排 2 分钟」就是假信息——用户照着这个数交任务，
   * 只会看到它被打到「今天到此为止」下面。剩不到一个最小空档，就直接算今天收工。
   */
  const closedForToday = minutesLeftToday < Math.max(settings.min_gap_min, 1)

  const tomorrowKey = dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const firstOverflow = result.overflow[0]
  const deferTarget = firstOverflow
    ? nextFittingDate(firstOverflow.task, tasks ?? [], settings, now)
    : null
  const deferLabel = deferTarget
    ? deferTarget === tomorrowKey
      ? '挪到明天'
      : `挪到 ${formatMonthDay(deferTarget)}`
    : '挪到明天'

  /**
   * 提交顺序：先建卡（乐观入队，卡片秒出）→ 后台解析 → 按 raw_index 合并。
   * 解析失败或超时都不打扰用户：卡片停在「未定时间」，数据一条不少。
   */
  const handleCapture = async (lines: string[]) => {
    const clean = lines.map((line) => line.trim()).filter((line) => line.length > 0)
    if (clean.length === 0) return

    const created = await createTasksFromLines(clean)
    const ids = created.map((task) => task.id)

    setPendingIds((prev) => new Set([...prev, ...ids]))
    try {
      const parsed = await parseLines(clean, new Date())
      if (parsed.ok) {
        await applyParsedItems(ids, parsed.items)
        // 分档只处理这批新增，失败就留在 today，不影响任何交互
        await assignBucketsByIds(ids, settings, new Date())
      }
    } catch {
      // 断网 / 超时 / 结构不符合契约：停在「未定时间」，不弹任何提示
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
    }
  }

  const handleComplete = (task: Task) => void completeTask(task.id)
  const handleUncomplete = (task: Task) => void uncompleteTask(task.id)
  const handleDefer = (task: Task) => void deferTask(task, tasks ?? [], settings, now)
  const handlePullToday = (task: Task) => void pullTaskToToday(task.id)
  const handleEditFixedEnd = (task: Task, minutes: number) => void setFixedEnd(task, minutes, now)

  return (
    <div>
      <header className="sticky top-0 z-10 border-b border-line/70 bg-canvas/92 backdrop-blur">
        <div className="mx-auto w-full max-w-[520px] px-4 pt-4 pb-3">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-[17px] font-semibold tracking-tight">待办</h1>
            <span className="text-[11px] text-ink-soft tabular-nums">
              今天 {result.totalToday} 件 · 已排 {result.placed.length} 件
            </span>
          </div>

          <div className="mt-1 flex items-baseline justify-between gap-3 text-[11px] text-ink-faint">
            <span className="tabular-nums">
              {closedForToday
                ? '今天已收工'
                : capacityLeft <= 0
                  ? '今天排满了'
                  : `今天还能排 ${formatHours(remainingMin)}`}
            </span>
            <span className="tabular-nums">
              {closedForToday
                ? `明天 ${settings.work_start} 开始`
                : result.endsAtMin !== null
                  ? `预计 ${formatClock(result.endsAtMin)} 收工`
                  : '还没开始排'}
            </span>
          </div>

          <CaptureBox onCapture={handleCapture} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[520px] px-4 pb-6">
        {isNative() && !settings.ai_key ? (
          <p className="mt-3 text-center text-[11px] text-warn">
            没填 AI Key · 解析和分档不会工作，去「设置」填
          </p>
        ) : null}

        {reminder && (tasks ?? []).length > 0 ? (
          <button
            type="button"
            onClick={() => {
              void exportBackup().then(() => setReminder(null))
            }}
            className="mt-3 w-full text-center text-[11px] text-ink-faint"
          >
            {reminder.label} · 导出
          </button>
        ) : null}

        <QueueList
          result={result}
          tomorrowKey={tomorrowKey}
          deferLabel={deferLabel}
          pendingIds={pendingIds}
          onComplete={handleComplete}
          onUncomplete={handleUncomplete}
          onDefer={handleDefer}
          onPullToday={handlePullToday}
          onEditFixedEnd={handleEditFixedEnd}
        />
      </main>
    </div>
  )
}
