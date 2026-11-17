import type { Bucket, Task } from '../../db/db'
import { moveTaskBucket, useTasks } from '../../db/tasks'
import { compareTasks } from '../../lib/queue'
import { formatHours } from '../../lib/time'

const GROUPS: Array<{ bucket: Bucket; label: string }> = [
  { bucket: 'now', label: '现在' },
  { bucket: 'today', label: '今天' },
  { bucket: 'week', label: '本周' },
  { bucket: 'later', label: '以后' },
]

/** 固定事件缺估时按 60 分钟算（它占的是整段），软任务按 30 */
function estimateOf(task: Task): number {
  if (task.est_min && task.est_min > 0) return Math.round(task.est_min)
  return task.is_fixed ? 60 : 30
}

export function AllPage() {
  const tasks = useTasks()
  const todo = (tasks ?? []).filter((task) => task.status === 'todo')

  return (
    <main className="mx-auto w-full max-w-[520px] px-4 pt-5 pb-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-tight">全部</h1>
        <span className="text-[11px] tabular-nums text-ink-faint">{todo.length} 件待办</span>
      </header>
      <p className="mt-1 text-[12px] text-ink-soft">按档位分组，拿不准的可以挪到今天。</p>

      {todo.length === 0 ? (
        <p className="mt-10 text-center text-[12px] leading-relaxed text-ink-faint">
          还没有任何待办。
          <br />
          回到队列页写一句就进队。
        </p>
      ) : null}

      <div className="mt-4 space-y-5">
        {GROUPS.map((group) => {
          const items = todo
            .filter((task) => task.bucket === group.bucket)
            .sort(compareTasks)
          if (items.length === 0) return null

          const minutes = items.reduce((sum, task) => sum + estimateOf(task), 0)

          return (
            <section key={group.bucket}>
              <div className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1.5">
                <div className="flex items-baseline gap-2">
                  <h2 className="text-[13px] font-semibold">{group.label}</h2>
                  <span className="text-[11px] tabular-nums text-ink-faint">
                    {items.length} 件
                  </span>
                </div>
                <span className="text-[11px] tabular-nums text-ink-faint">
                  共 {formatHours(minutes)}
                </span>
              </div>

              <ul className="mt-1.5 space-y-1.5">
                {items.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {task.is_fixed ? (
                          <span className="shrink-0 rounded bg-canvas px-1 py-0.5 text-[9.5px] leading-none text-ink-faint">
                            固定
                          </span>
                        ) : null}
                        <span className="min-w-0 flex-1 truncate text-[13px] leading-snug">
                          {task.title}
                        </span>
                      </div>
                      <div className="mt-0.5 text-[10.5px] tabular-nums text-ink-faint">
                        {estimateOf(task)} 分钟
                        {task.due_at ? ` · 截止 ${task.due_at.slice(0, 10)}` : ''}
                      </div>
                    </div>

                    {task.is_fixed ? null : group.bucket === 'week' || group.bucket === 'later' ? (
                      <button
                        type="button"
                        onClick={() => void moveTaskBucket(task, 'today')}
                        className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-soft active:bg-canvas"
                      >
                        挪到今天
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void moveTaskBucket(task, 'week')}
                        className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-soft active:bg-canvas"
                      >
                        挪到本周
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </main>
  )
}
