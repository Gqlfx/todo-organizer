import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card ${className}`}>{children}</section>
  )
}

export function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-[13px] font-semibold tracking-tight text-ink">{title}</h2>
      {hint ? <span className="text-[11px] text-ink-faint">{hint}</span> : null}
    </div>
  )
}

export function Stepper({
  value,
  onChange,
  step,
  min = 0,
  max = 1440,
  label,
}: {
  value: number
  onChange: (next: number) => void
  step: number
  min?: number
  max?: number
  label: string
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next))
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`${label} 减少 ${step} 分钟`}
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-[16px] leading-none text-ink-soft transition active:scale-95 disabled:opacity-35"
      >
        −
      </button>
      <div className="min-w-[72px] text-center text-[13px] font-medium tabular-nums">
        {value === 0 ? '0 分钟' : `${value} 分`}
      </div>
      <button
        type="button"
        aria-label={`${label} 增加 ${step} 分钟`}
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-card text-[16px] leading-none text-ink-soft transition active:scale-95 disabled:opacity-35"
      >
        +
      </button>
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
  tone = 'accent',
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  tone?: 'accent' | 'warn'
}) {
  const activeClass = tone === 'warn' ? 'bg-warn text-white' : 'bg-accent text-white'
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg px-1 py-1.5 text-[11px] tabular-nums transition ${
        active ? activeClass : 'bg-card text-ink-soft ring-1 ring-line hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-[#d8dce2]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}
