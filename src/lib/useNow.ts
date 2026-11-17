import { useEffect, useState } from 'react'

/**
 * 队列依赖“现在”：空档起点、推算时段都会随时间变化。
 * 每分钟醒一次就够，不需要秒级。
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])

  return now
}
