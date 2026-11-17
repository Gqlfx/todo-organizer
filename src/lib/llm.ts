/**
 * 唯一的模型出口。两条路：
 *
 * - 浏览器（dev / PWA）：`/api/llm/*`，key 由 Vite proxy 在 Node 侧注入，前端永远拿不到。
 * - 原生（APK）：没有 proxy，直连 `api.deepseek.com`，Authorization 用设置页存的那把 key。
 *   直连能过 CORS，是因为 `capacitor.config.ts` 开了 CapacitorHttp（fetch 由原生代发）。
 *
 * 这里不做任何业务判断：给 messages，拿 content。
 */

import { Capacitor } from '@capacitor/core'
import { SETTINGS_ID, db } from '../db/db'

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  maxTokens?: number
  /** 默认要求 json_object；只有明确要纯文本时才传 false */
  json?: boolean
  timeoutMs?: number
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
}

export interface ChatResponse {
  content: string
  model: string | null
  usage: ChatUsage | null
}

export const LLM_MODEL = 'deepseek-flash'

const PROXY_ENDPOINT = '/api/llm/chat/completions'
const DIRECT_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MAX_TOKENS = 512
const DEFAULT_TIMEOUT_MS = 20_000

export class LlmError extends Error {
  readonly status: number | null
  readonly body: string | null

  constructor(message: string, status: number | null = null, body: string | null = null) {
    super(message)
    this.name = 'LlmError'
    this.status = status
    this.body = body
  }
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

async function readNativeKey(): Promise<string> {
  const settings = await db.settings.get(SETTINGS_ID)
  return (settings?.ai_key ?? '').trim()
}

function readUsage(payload: unknown): ChatUsage | null {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage
  if (!usage) return null

  const details = usage.completion_tokens_details as { reasoning_tokens?: number } | undefined
  return {
    promptTokens: Number(usage.prompt_tokens ?? 0),
    completionTokens: Number(usage.completion_tokens ?? 0),
    reasoningTokens: Number(details?.reasoning_tokens ?? 0),
  }
}

export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const native = isNative()
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let endpoint = PROXY_ENDPOINT

  if (native) {
    const key = await readNativeKey()
    if (!key) throw new LlmError('还没填 AI Key（设置 → AI）')
    endpoint = DIRECT_ENDPOINT
    headers.Authorization = `Bearer ${key}`
  }

  const controller = new AbortController()
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS

  /**
   * CapacitorHttp 接管的 fetch 不一定认 AbortSignal，所以再压一层超时兜底：
   * 原生下靠 Promise.race 按期失败，浏览器下 signal 和 race 都生效。
   */
  let timer: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      controller.abort()
      reject(new LlmError('请求超时'))
    }, timeoutMs)
  })

  let response: Response
  try {
    response = await Promise.race([
      fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: LLM_MODEL,
          messages: request.messages,
          // 不关的话 reasoning token 会按输出价计费，还会把 max_tokens 吃掉一半
          thinking: { type: 'disabled' },
          ...(request.json === false ? {} : { response_format: { type: 'json_object' } }),
          max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
          temperature: 0,
          stream: false,
        }),
        signal: controller.signal,
      }),
      timeout,
    ])
  } catch (error) {
    if (error instanceof LlmError) throw error
    const aborted = error instanceof Error && error.name === 'AbortError'
    if (aborted) throw new LlmError('请求超时')
    throw new LlmError(
      native ? '请求没发出去（检查网络和 AI Key）' : '请求没发出去（离线或代理没起）',
    )
  } finally {
    window.clearTimeout(timer)
  }

  const text = await response.text()
  if (!response.ok) {
    const hint =
      native && (response.status === 401 || response.status === 403)
        ? '（AI Key 不对或已失效）'
        : ''
    throw new LlmError(`HTTP ${response.status}${hint}`, response.status, text.slice(0, 400))
  }

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new LlmError('响应不是 JSON', response.status, text.slice(0, 400))
  }

  const message = (payload as { choices?: Array<{ message?: { content?: unknown } }> } | null)
    ?.choices?.[0]?.message
  const content = message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new LlmError('响应里没有 content', response.status, text.slice(0, 400))
  }

  const usage = readUsage(payload)
  if (import.meta.env.DEV) {
    console.info('[llm]', {
      route: native ? 'direct' : 'proxy',
      model: (payload as { model?: string }).model ?? null,
      usage,
    })
  }

  return {
    content,
    model: (payload as { model?: string }).model ?? null,
    usage,
  }
}
