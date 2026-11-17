import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import type { Settings } from '../../db/db'
import { setAiKey } from '../../db/settings'
import { Card, SectionTitle } from './ui'

/**
 * AI Key 只在「打包成 App」之后有用：浏览器里走 Vite proxy，key 在 Node 侧注入。
 * 输入框遮住全文，但露出后 4 位——既要能确认自己填对了，又不能整把摊在屏幕上。
 */
export function AiKeyCard({ settings }: { settings: Settings }) {
  const saved = settings.ai_key
  const [draft, setDraft] = useState(saved)
  const native = Capacitor.isNativePlatform()

  // 导入备份时 ai_key 保留本机值，但库可能被整行替换，这里跟着库走
  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const commit = () => {
    const next = draft.trim()
    if (next === saved) return
    void setAiKey(next)
  }

  const tail = saved.length >= 12 ? saved.slice(-4) : ''
  const masked = saved ? `••••${tail || '••••'}` : '未填'

  return (
    <Card className="mt-3 px-4 pt-3.5 pb-3">
      <SectionTitle title="AI Key" hint={native ? '这台设备直连用' : '只在 App 里生效'} />

      <div className="mt-2 flex items-center gap-2">
        <input
          type="password"
          value={draft}
          placeholder="sk-..."
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
          }}
          className="min-w-0 flex-1 rounded-lg bg-canvas px-2.5 py-2 font-mono text-[12px] tracking-wide ring-1 ring-line focus:ring-2 focus:ring-accent/50 focus:outline-none"
        />
        {saved ? (
          <button
            type="button"
            onClick={() => void setAiKey('')}
            className="shrink-0 rounded-lg bg-card px-2.5 py-2 text-[11px] text-ink-soft ring-1 ring-line active:bg-canvas"
          >
            清除 Key
          </button>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className="text-ink-faint">
          已保存 <span className="font-mono tabular-nums text-ink-soft">{masked}</span>
        </span>
        <span className="text-ink-faint">改完失焦即存</span>
      </div>

      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-faint">
        {native
          ? 'App 里没有代理，模型请求直连 DeepSeek，用这把 key。没填的话解析和分档会静默失败，任务停在「未定时间」。'
          : '浏览器里由 Vite 代理注入 key，这里填了也不会被用到；打包成 App 后才生效。'}
      </p>
    </Card>
  )
}
