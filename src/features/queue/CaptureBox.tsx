import { useEffect, useRef, useState } from 'react'

/**
 * 输入即入队：回车提交，多行 = 多条，不弹确认、不改写原文。
 * Shift+回车 才换行（粘一整段多行文本时也是一次提交多条）。
 */
export function CaptureBox({ onCapture }: { onCapture: (lines: string[]) => Promise<unknown> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  const submit = async () => {
    const lines = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
    if (lines.length === 0 || busy) return

    setBusy(true)
    setValue('')
    try {
      await onCapture(lines)
    } finally {
      setBusy(false)
      ref.current?.focus()
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-card px-3 py-2.5 transition focus-within:border-accent/45">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        enterKeyHint="send"
        aria-label="记一条待办"
        placeholder="写一句，回车入队（多行粘贴 = 多条）"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            void submit()
          }
        }}
        className="block max-h-[140px] w-full resize-none bg-transparent text-[13.5px] leading-relaxed outline-none placeholder:text-ink-faint"
      />
    </div>
  )
}
