export type AppTab = 'queue' | 'all' | 'settings'

const TABS: Array<{ key: AppTab; label: string }> = [
  { key: 'queue', label: '队列' },
  { key: 'all', label: '全部' },
  { key: 'settings', label: '设置' },
]

export function TabBar({ tab, onChange }: { tab: AppTab; onChange: (next: AppTab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[520px] pb-[env(safe-area-inset-bottom)]">
        {TABS.map((item) => {
          const active = item.key === tab
          return (
            <button
              key={item.key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(item.key)}
              className={`flex-1 pt-3 pb-3 text-[12px] transition ${
                active ? 'font-medium text-ink' : 'text-ink-faint'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
