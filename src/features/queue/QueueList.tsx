import { useState } from 'react'
import type { Task } from '../../db/db'
import type {
  FixedBlock,
  OverflowTask,
  PlacedTask,
  QueueGap,
  QueueResult,
} from '../../lib/queue'
import { upcomingDateOf } from '../../lib/queue'
import { formatClock, formatHours, formatMonthDay, parseClock } from '../../lib/time'

type Row =
  | { type: 'fixed'; block: FixedBlock }
  | { type: 'task'; item: PlacedTask }
  | { type: 'gap'; gap: QueueGap }

interface QueueListProps {
  result: QueueResult
  tomorrowKey: string
  deferLabel: string
  /** 正在解析的那批任务：解析没回来之前不显示「未定时间」，避免闪一下 */
  pendingIds: ReadonlySet<string>
  onComplete: (task: Task) => void
  onUncomplete: (task: Task) => void
  onDefer: (task: Task) => void
  onPullToday: (task: Task) => void
  onEditFixedEnd: (task: Task, minutes: number) => void
}

/**
 * 把固定段、已排任务、剩余空档按时间顺序排成一列。
 * 队列里只允许四种东西：固定行 / 空档线 / 任务卡 / 尽力线。
 */
function buildRows(result: QueueResult): Row[] {
  const events: Array<{ start: number; row: Row }> = [
    ...result.fixed.map((block) => ({
      start: block.startMin,
      row: { type: 'fixed' as const, block },
    })),
    ...result.placed.map((item) => ({
      start: item.startMin,
      row: { type: 'task' as const, item },
    })),
  ].sort((a, b) => a.start - b.start)

  const rows: Row[] = []
  let index = 0

  for (const gap of result.gaps) {
    while (index < events.length && events[index].start <= gap.startMin) {
      rows.push(events[index].row)
      index += 1
    }
    rows.push({ type: 'gap', gap })
  }

  while (index < events.length) {
    rows.push(events[index].row)
    index += 1
  }

  return rows
}

function FixedRow({
  block,
  onEditEnd,
}: {
  block: FixedBlock
  onEditEnd: (task: Task, minutes: number) => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="relative overflow-hidden rounded-xl bg-ink px-3 py-2.5 text-white">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-[#3fae97]" aria-hidden />
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 truncate text-[13.5px] leading-snug">{block.task.title}</span>

        {editing ? (
          <input
            type="time"
            autoFocus
            defaultValue={formatClock(block.endMin)}
            aria-label={`${block.task.title} 的结束时间`}
            onChange={(event) => {
              const minutes = parseClock(event.target.value)
              if (minutes !== null && minutes > block.startMin) {
                onEditEnd(block.task, minutes)
                setEditing(false)
              }
            }}
            onBlur={() => setEditing(false)}
            className="w-[86px] shrink-0 rounded bg-white/15 px-1 py-0.5 text-[11.5px] tabular-nums text-white outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`修改 ${block.task.title} 的结束时间`}
            onClick={() => setEditing(true)}
            className="shrink-0 rounded border-b border-dotted border-white/50 px-0.5 pb-px text-[11.5px] tabular-nums text-white/85"
          >
            {formatClock(block.startMin)}–{formatClock(block.endMin)}
          </button>
        )}
      </div>
    </div>
  )
}

function GapLine({ gap }: { gap: QueueGap }) {
  return (
    <div className="py-0.5 pl-0.5 text-[11px] text-ink-faint">
      {formatClock(gap.startMin)} 之后 · 空档 {formatHours(gap.endMin - gap.startMin)}
    </div>
  )
}

function TaskCard({
  item,
  showUndetermined,
  onComplete,
}: {
  item: PlacedTask
  showUndetermined: boolean
  onComplete: (task: Task) => void
}) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-line bg-card px-3 py-2.5">
      <button
        type="button"
        aria-label={`完成：${item.task.title}`}
        onClick={() => onComplete(item.task)}
        className="mt-[3px] h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-ink-faint/70 active:bg-accent-soft"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 break-words text-[13.5px] leading-snug">
            {item.task.title}
          </span>
          <span className="shrink-0 text-[11.5px] tabular-nums text-ink-faint">
            {item.estMin} 分钟
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5 text-[11.5px] tabular-nums text-ink-soft">
          <span>
            {formatClock(item.startMin)}–{formatClock(item.endMin)}
          </span>
          {showUndetermined ? (
            <span className="text-[10.5px] text-warn/85">未定时间</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function OverflowCard({
  item,
  first,
  deferLabel,
  showUndetermined,
  onDefer,
}: {
  item: OverflowTask
  first: boolean
  deferLabel: string
  showUndetermined: boolean
  onDefer: (task: Task) => void
}) {
  return (
    <div className="rounded-xl border border-line/60 bg-card/60 px-3 py-2.5">
      {first ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[10px] leading-none text-ink-soft">
            今天装不下
          </span>
          <button
            type="button"
            onClick={() => onDefer(item.task)}
            className="rounded-md border border-line bg-card px-2 py-1 text-[10.5px] leading-none text-ink-soft active:bg-canvas"
          >
            {deferLabel}
          </button>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1 break-words text-[13px] leading-snug text-ink-faint">
          {item.task.title}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-ink-faint/80">
          {item.estMin} 分钟 · 明天
        </span>
      </div>
      {showUndetermined ? (
        <div className="mt-0.5 text-[10.5px] text-warn/85">未定时间</div>
      ) : null}
    </div>
  )
}

function SectionToggle({
  label,
  open,
  onToggle,
}: {
  label: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 py-2 text-[11.5px] text-ink-faint"
    >
      <span>{label}</span>
      <span className="text-[13px] leading-none">{open ? '−' : '+'}</span>
    </button>
  )
}

function UpcomingSection({
  items,
  tomorrowKey,
  onPullToday,
}: {
  items: Task[]
  tomorrowKey: string
  onPullToday: (task: Task) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  const allTomorrow = items.every((task) => upcomingDateOf(task) === tomorrowKey)
  const label = `${allTomorrow ? '明天' : '之后'} ${items.length} 件 · ${open ? '收起' : '点开可拉回'}`

  return (
    <div className="mt-4 border-t border-line/70 pt-1">
      <SectionToggle label={label} open={open} onToggle={() => setOpen((value) => !value)} />

      {open ? (
        <div className="space-y-1.5 pb-1">
          {items.map((task) => {
            const dateKey = upcomingDateOf(task)
            return (
              <div
                key={task.id}
                className="flex items-baseline justify-between gap-3 rounded-lg bg-card/70 px-2.5 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink-soft">
                  {task.title}
                </span>
                <span className="shrink-0 text-[10.5px] tabular-nums text-ink-faint">
                  {dateKey === tomorrowKey ? '明天' : formatMonthDay(dateKey)}
                </span>
                {task.is_fixed ? null : (
                  <button
                    type="button"
                    onClick={() => onPullToday(task)}
                    className="shrink-0 text-[11px] text-accent"
                  >
                    拉回今天
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function CompletedSection({
  items,
  onUncomplete,
}: {
  items: Task[]
  onUncomplete: (task: Task) => void
}) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div className="mt-4 border-t border-line/70 pt-1">
      <SectionToggle
        label={`今天已完成 ${items.length} 件 · ${open ? '收起' : '展开'}`}
        open={open}
        onToggle={() => setOpen((value) => !value)}
      />

      {open ? (
        <div className="space-y-1.5 pb-1">
          {items.map((task) => (
            <div
              key={task.id}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-card/70 px-2.5 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-faint line-through">
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => onUncomplete(task)}
                className="shrink-0 text-[11px] text-accent"
              >
                取消完成
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function QueueList({
  result,
  tomorrowKey,
  deferLabel,
  pendingIds,
  onComplete,
  onUncomplete,
  onDefer,
  onPullToday,
  onEditFixedEnd,
}: QueueListProps) {
  const rows = buildRows(result)
  const unplaced = result.overflow.length + result.waitingWeek.length
  const isEmpty =
    rows.length === 0 &&
    unplaced === 0 &&
    result.upcoming.length === 0 &&
    result.completedToday.length === 0

  if (isEmpty) {
    return (
      <p className="mt-10 text-center text-[12px] leading-relaxed text-ink-faint">
        今天还没有任务。
        <br />
        上面写一句，回车就进队列。
      </p>
    )
  }

  return (
    <div>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => {
          if (row.type === 'fixed')
            return (
              <FixedRow
                key={`fixed-${row.block.task.id}`}
                block={row.block}
                onEditEnd={onEditFixedEnd}
              />
            )
          if (row.type === 'task')
            return (
              <TaskCard
                key={`task-${row.item.task.id}`}
                item={row.item}
                showUndetermined={
                  row.item.task.parse_confidence === 0 && !pendingIds.has(row.item.task.id)
                }
                onComplete={onComplete}
              />
            )
          return <GapLine key={`gap-${index}-${row.gap.startMin}`} gap={row.gap} />
        })}
      </div>

      {result.overflow.length > 0 ? (
        <>
          <div className="mt-4 flex items-center gap-2">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-ink-faint">今天到此为止</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="mt-2 space-y-2">
            {result.overflow.map((item, index) => (
              <OverflowCard
                key={`overflow-${item.task.id}`}
                item={item}
                first={index === 0}
                deferLabel={deferLabel}
                showUndetermined={
                  item.task.parse_confidence === 0 && !pendingIds.has(item.task.id)
                }
                onDefer={onDefer}
              />
            ))}
          </div>
        </>
      ) : null}

      {unplaced > 0 ? (
        <p className="mt-3 text-center text-[11px] text-ink-faint">
          还有 {unplaced} 件没排上
          {result.waitingWeek.length > 0 ? `（含本周 ${result.waitingWeek.length} 件）` : ''}
        </p>
      ) : null}

      <UpcomingSection
        items={result.upcoming}
        tomorrowKey={tomorrowKey}
        onPullToday={onPullToday}
      />

      <CompletedSection items={result.completedToday} onUncomplete={onUncomplete} />
    </div>
  )
}
