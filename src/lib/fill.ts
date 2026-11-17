/**
 * 空档分档口径 —— v1.0 修订 1（08:52）定死，Day 3 装填直接照这里用，不要再改阈值。
 *
 *   < min_gap_min（默认 10 分钟）  丢弃
 *   10–30 分钟                     碎片，只放 est_min ≤ 该时长的任务
 *   ≥ 30 分钟                      整块，可放任意任务
 *
 * 唯一允许的变量是 min_gap_min（设置里可调，默认 10）；30 分钟这条线是硬编码的。
 */
export const FRAGMENT_MIN = 10
export const BLOCK_MIN = 30

export type GapKind = 'dropped' | 'fragment' | 'block'

export function classifyGap(minutes: number, dropBelow: number = FRAGMENT_MIN): GapKind {
  if (minutes < dropBelow) return 'dropped'
  if (minutes < BLOCK_MIN) return 'fragment'
  return 'block'
}

/**
 * 这条空档能不能装下这条任务。
 * 碎片：est_min 必须 ≤ 空档长度（20 分钟碎片放不下 30 分钟任务）。
 * 整块：同样要求 est_min ≤ 空档长度 —— 整块只意味着“不挑任务类型”，不意味着无限长。
 */
export function canFit(kind: GapKind, gapMinutes: number, estMin: number): boolean {
  if (kind === 'dropped') return false
  return estMin <= gapMinutes
}
