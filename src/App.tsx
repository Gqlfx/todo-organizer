import { useEffect, useState } from 'react'
import { loadSettings, useSettings } from './db/settings'
import { TabBar, type AppTab } from './features/nav/TabBar'
import { AllPage } from './features/all/AllPage'
import { QueuePage } from './features/queue/QueuePage'
import { SettingsPage } from './features/settings/SettingsPage'

function Shell({ title, detail }: { title: string; detail?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {detail ? (
        <div className="text-[11.5px] leading-relaxed text-ink-faint">{detail}</div>
      ) : null}
      {detail ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 rounded-xl bg-ink px-3 py-1.5 text-[12px] text-white"
        >
          重新加载
        </button>
      ) : null}
    </main>
  )
}

export default function App() {
  const settings = useSettings()
  const [booted, setBooted] = useState(false)
  const [bootError, setBootError] = useState<string | null>(null)
  const [tab, setTab] = useState<AppTab>('queue')

  useEffect(() => {
    let cancelled = false
    loadSettings()
      .catch((error: unknown) => {
        if (cancelled) return
        setBootError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        if (!cancelled) setBooted(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (bootError) {
    return <Shell title="本机数据库打不开" detail={`${bootError}（隐私模式或存储被禁用时会这样）`} />
  }

  if (!booted || !settings) {
    return <Shell title="正在读取本机数据" />
  }

  return (
    <div className="min-h-dvh pb-[68px]">
      {tab === 'queue' ? <QueuePage settings={settings} /> : null}
      {tab === 'all' ? <AllPage /> : null}
      {tab === 'settings' ? <SettingsPage settings={settings} /> : null}
      <TabBar tab={tab} onChange={setTab} />
    </div>
  )
}
