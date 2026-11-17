import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 拖动滑杆时不要每一帧都写 IndexedDB：先在本地显示，松手/失焦时写一次。
 * 组件卸载（比如切到另一天）会把还没落库的值补写，避免改动凭空消失。
 *
 * onDraft：把「正在拖的值」也通知给外层。柱状图、顶部「今日可用」靠它实时跟着动，
 * 否则同一屏里会出现「滑杆显示 4 小时、柱子还是 1 小时」。
 */
export function useDraftNumber(
  value: number,
  commit: (next: number) => void,
  onDraft?: (next: number | null) => void,
) {
  const [draft, setDraft] = useState<number | null>(null)
  const pending = useRef<number | null>(null)
  const commitRef = useRef(commit)
  commitRef.current = commit
  const draftRef = useRef(onDraft)
  draftRef.current = onDraft

  const set = useCallback((next: number) => {
    pending.current = next
    setDraft(next)
    draftRef.current?.(next)
  }, [])

  /** 松手只负责写库；草稿等外部值追上来再清，避免落库那几毫秒闪回旧值。 */
  const flush = useCallback(() => {
    const next = pending.current
    pending.current = null
    if (next !== null) commitRef.current(next)
  }, [])

  /**
   * 外部值一变就丢草稿。两种情况都会走到这里：
   * 1) 自己落库成功 → value 追上了草稿，草稿功成身退（视觉上连续，不闪）
   * 2) 预设按钮 / 导入备份改了值 → 草稿已经过时，必须让位给库里的真相
   * 用 prevValue 挡住「拖动中 draft 变化」的触发，否则一拖就被清。
   */
  const prevValue = useRef(value)
  useEffect(() => {
    if (prevValue.current === value) return
    prevValue.current = value
    if (draft !== null) {
      setDraft(null)
      draftRef.current?.(null)
    }
  }, [value, draft])

  useEffect(() => {
    return () => {
      const next = pending.current
      pending.current = null
      draftRef.current?.(null)
      if (next !== null) commitRef.current(next)
    }
  }, [])

  return { display: draft ?? value, set, flush }
}
