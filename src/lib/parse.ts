import { dateKey, weekdayOf, WEEKDAY_LABEL } from './capacity'
import { chat, LlmError } from './llm'
import { parseDateTimeValue } from './time'

/**
 * 把输入行拆成结构化任务。只负责「文本 → 契约对象」，不写库、不碰 UI。
 * 契约里 end_at 允许 null：文本没提结束时间就不许猜，结束时刻由 computeQueue 兜底。
 */

export interface ParsedItem {
  raw_index: number
  title: string | null
  due_at: string | null
  start_at: string | null
  end_at: string | null
  est_min: number | null
  is_fixed: boolean
}

export type ParseResult =
  | { ok: true; items: ParsedItem[]; source: 'network' | 'fixture' }
  | { ok: false; reason: string }

const MAX_TOKENS = 512

export function buildSystemPrompt(now: Date): string {
  const today = `${dateKey(now)}（${WEEKDAY_LABEL[weekdayOf(now)]}）`
  return `你是待办解析器。把用户给的每一行拆成一条结构化任务。

今天是 ${today}，所有相对日期都以今天为基准计算（"周四前"= 从今天算起的那个周四）。

只输出 JSON，结构必须是：
{"items":[{"raw_index":0,"title":"...","due_at":null,"start_at":null,"end_at":null,"est_min":null,"is_fixed":false}]}

硬规则：
1. 输入有几行，items 就必须有几条；raw_index 从 0 开始，与行号一一对应，不许漏行、不许合并、不许重复。
2. title：这条任务的简短标题，保留原意，不要加解释。
3. due_at：明确的截止时间，格式 "YYYY-MM-DD" 或 "YYYY-MM-DDTHH:mm"。没提就 null，绝不猜。
4. start_at：只有说了具体几点开始才填，格式 "YYYY-MM-DDTHH:mm"。没提就 null。
5. end_at：只有明确说了结束时间才填（例如"9点到11点"），格式 "YYYY-MM-DDTHH:mm"。没提就 null，不许用开始时间加时长去推。
6. est_min：只有明确说了时长才填，必须是 5 的倍数（"大概一小时"→60，"半小时"→30）。没提就 null。
7. is_fixed：只有「有明确开始时刻 + 会独占一段时间」的事才为 true（开会、上课、面试、看医生）。
   其余（买东西、写方案、回消息）一律 false。
8. 拿不准的字段一律 null。宁可为空，不许编造时间。`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 只接受带日期的 ISO 片段："YYYY-MM-DD" 或 "YYYY-MM-DDTHH:mm" */
function normalizeWhen(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(text)) return null
  return parseDateTimeValue(text) ? text : null
}

/** est_min 只接受 5 的倍数；不合规就当缺失，交给上层补 30 */
function normalizeEst(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const minutes = Math.round(value)
  if (minutes <= 0 || minutes > 1440 || minutes % 5 !== 0) return null
  return minutes
}

function normalizeItem(raw: Record<string, unknown>): ParsedItem | null {
  const index = raw.raw_index
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null

  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : null

  return {
    raw_index: index,
    title,
    due_at: normalizeWhen(raw.due_at),
    start_at: normalizeWhen(raw.start_at),
    end_at: normalizeWhen(raw.end_at),
    est_min: normalizeEst(raw.est_min),
    is_fixed: raw.is_fixed === true,
  }
}

/**
 * 三层解包，任何一层不对就整批作废（坏数据不进库）：
 * 1. 顶层含 content → 取 content（可能是字符串或对象）
 * 2. items 必须是数组
 * 3. 每条必须有合法的 raw_index，且落在输入行号范围内
 */
export function unwrapItems(content: string, lineCount: number): ParsedItem[] | null {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return null
  }

  if (isRecord(value) && 'content' in value) {
    const inner = value.content
    if (typeof inner === 'string') {
      try {
        value = JSON.parse(inner)
      } catch {
        return null
      }
    } else {
      value = inner
    }
  }

  if (!isRecord(value) || !Array.isArray(value.items)) return null

  const items: ParsedItem[] = []
  const seen = new Set<number>()

  for (const raw of value.items) {
    if (!isRecord(raw)) return null
    const item = normalizeItem(raw)
    if (!item) return null
    if (item.raw_index >= lineCount) return null
    if (seen.has(item.raw_index)) return null
    seen.add(item.raw_index)
    items.push(item)
  }

  return items
}

function fixtureEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  return new URLSearchParams(window.location.search).get('llm') === 'fixture'
}

export async function parseLines(lines: string[], now: Date): Promise<ParseResult> {
  const clean = lines.map((line) => line.trim()).filter((line) => line.length > 0)
  if (clean.length === 0) return { ok: false, reason: '没有输入' }

  let content: string
  let source: 'network' | 'fixture' = 'network'

  // 这一整支只在 DEV 存在：import.meta.env.DEV 为 false 时会被打包器直接摘掉，
  // fixture 的 chunk 不会进生产包。
  if (import.meta.env.DEV && fixtureEnabled()) {
    // 动态导入：fixture 只在开发期按需加载，不进生产包的主链
    const { default: sampleResponse } = await import('./__fixtures__/parse.sample.json')
    const fixture = sampleResponse as { choices?: Array<{ message?: { content?: unknown } }> }
    const fixtureContent = fixture?.choices?.[0]?.message?.content
    if (typeof fixtureContent !== 'string') return { ok: false, reason: 'fixture 里没有 content' }
    content = fixtureContent
    source = 'fixture'
  } else {
    const userContent = `共 ${clean.length} 行：\n${clean
      .map((line, index) => `${index}: ${line}`)
      .join('\n')}`

    try {
      const response = await chat({
        messages: [
          { role: 'system', content: buildSystemPrompt(now) },
          { role: 'user', content: userContent },
        ],
        json: true,
        maxTokens: MAX_TOKENS,
      })
      content = response.content
    } catch (error) {
      return {
        ok: false,
        reason: error instanceof LlmError ? error.message : '请求失败',
      }
    }
  }

  const items = unwrapItems(content, clean.length)
  if (!items) return { ok: false, reason: '返回结构不符合契约' }

  return { ok: true, items, source }
}
