import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

/** 长按多久进入拖动 */
const LONG_PRESS_MS = 300
/** 长按期间移动超过这个距离就当作滚动，不进拖动 */
const CANCEL_DISTANCE = 8

interface Press {
  id: string
  pointerId: number
  x: number
  y: number
  el: HTMLElement
  timer: number
}

export interface DragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void
}

export interface DragOrder {
  /** 正在拖的任务 id；null = 没在拖 */
  dragId: string | null
  /** 相对按下点的纵向位移，用来让卡片跟手 */
  offsetY: number
  /** 拖动刚结束时消费一次：卡片要跳过紧跟着的那次 click，否则一松手就展开 */
  justDragged: () => boolean
  registerCard: (id: string, el: HTMLElement | null) => void
  handlers: (id: string) => DragHandlers
}

/**
 * 长按 300ms 进入拖动，上下移动换位，松手落位。
 *
 * 为什么不用 dnd-kit：这里只需要「一维列表换位」这一种交互，
 * 它带来的可拖拽画布、碰撞检测、键盘传感器都用不上，还会和页面的触摸滚动抢事件。
 *
 * 拖动期间不改数据，松手才把新顺序回调出去——写库失败时界面已经回到原样，不会半途而废。
 */
export function useDragOrder(ids: string[], onCommit: (next: string[]) => void): DragOrder {
  const [dragId, setDragId] = useState<string | null>(null)
  const [offsetY, setOffsetY] = useState(0)
  const pressRef = useRef<Press | null>(null)
  const draggingRef = useRef<string | null>(null)
  const cards = useRef(new Map<string, HTMLElement>())
  const idsRef = useRef(ids)
  idsRef.current = ids
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  const suppressClick = useRef(false)

  const registerCard = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cards.current.set(id, el)
    else cards.current.delete(id)
  }, [])

  const endDrag = useCallback((clientY: number | null) => {
    const press = pressRef.current
    if (press) window.clearTimeout(press.timer)
    pressRef.current = null

    const dragging = draggingRef.current
    draggingRef.current = null
    setDragId(null)
    setOffsetY(0)
    if (!dragging) return

    // 松手后浏览器还会补一个 click，先吃掉它；下个 tick 自动复位，不会误伤之后的正常点击
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)

    if (clientY === null) return

    const order = idsRef.current
    const from = order.indexOf(dragging)
    if (from < 0) return

    // 落点 = 第一个「指针还在它中线以上」的卡片之前；都没命中就落到末尾
    let target = order.length
    for (let index = 0; index < order.length; index += 1) {
      const el = cards.current.get(order[index])
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        target = index
        break
      }
    }

    const insertAt = target > from ? target - 1 : target
    if (insertAt === from) return

    const next = [...order]
    next.splice(from, 1)
    next.splice(insertAt, 0, dragging)
    commitRef.current(next)
  }, [])

  const handlers = useCallback(
    (id: string): DragHandlers => ({
      onPointerDown: (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return
        const el = event.currentTarget
        const pointerId = event.pointerId
        const timer = window.setTimeout(() => {
          draggingRef.current = id
          setDragId(id)
          setOffsetY(0)
          try {
            el.setPointerCapture(pointerId)
          } catch {
            // 指针已经抬起，忽略
          }
          navigator.vibrate?.(10)
        }, LONG_PRESS_MS)

        pressRef.current = {
          id,
          pointerId,
          x: event.clientX,
          y: event.clientY,
          el,
          timer,
        }
      },

      onPointerMove: (event) => {
        const press = pressRef.current
        if (!press) return

        if (draggingRef.current === null) {
          // 还没到 300ms 就开始动：这是滚动，不是拖拽
          if (
            Math.abs(event.clientY - press.y) > CANCEL_DISTANCE ||
            Math.abs(event.clientX - press.x) > CANCEL_DISTANCE
          ) {
            window.clearTimeout(press.timer)
            pressRef.current = null
          }
          return
        }

        // 已经进入拖动：拦掉滚动，让卡片跟手
        event.preventDefault()
        setOffsetY(event.clientY - press.y)
      },

      onPointerUp: (event) => endDrag(event.clientY),
      onPointerCancel: () => endDrag(null),
    }),
    [endDrag],
  )

  const justDragged = useCallback(() => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }, [])

  return { dragId, offsetY, justDragged, registerCard, handlers }
}
