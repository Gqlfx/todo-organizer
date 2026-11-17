// 安全地发一次 LLM 请求：默认关思考、小 max_tokens、自动记账。
// 跑法：node scripts/llm-test.mjs "把这句拆成 JSON：周四前把方案给老板"
//      node scripts/llm-test.mjs "..." --max-tokens=64 --json
//      node scripts/llm-test.mjs "..." --thinking        （只有在需要复现问题时才开）
//
// 目的：让每次调用的花费可见、可控，避免"一发请求烧掉几万 token"。

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// 价格按官网 rate card 改这里（美元 / 1M tokens）。默认取 Flash 档谷时价。
const PRICE_IN = 0.15
const PRICE_OUT = 0.6

const HARD_CAP = 512

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env.local')
const ledgerPath = join(root, '.llm-usage.local.json')

function loadEnv(path) {
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!m) continue
    out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}

const argv = process.argv.slice(2)
const prompt = argv.find((a) => !a.startsWith('--'))
const flag = (name, dflt) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.split('=')[1] : dflt
}
const has = (name) => argv.includes(`--${name}`)

if (!prompt) {
  console.error('用法：node scripts/llm-test.mjs "你的提示" [--max-tokens=64] [--json] [--thinking]')
  process.exit(1)
}

let maxTokens = Number(flag('max-tokens', 64))
if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = 64
if (maxTokens > HARD_CAP) {
  console.error(`\n[×] max_tokens=${maxTokens} 超过硬上限 ${HARD_CAP}。`)
  console.error('    测试阶段请用 64。真的需要更长时，改脚本里的 HARD_CAP，别在命令行绕。\n')
  process.exit(1)
}

const env = loadEnv(envPath)
const key = (env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim()
const baseUrl = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
const model = flag('model', 'deepseek-flash')

if (!key) {
  console.error(`[×] 没读到 key：${envPath}`)
  process.exit(1)
}

const body = {
  model,
  messages: [{ role: 'user', content: prompt }],
  max_tokens: maxTokens,
  stream: false,
}

// 默认关闭思考。不关的话 reasoning token 会按输出价计费，且不受正文 max_tokens 约束。
if (!has('thinking')) body.thinking = { type: 'disabled' }
if (has('json')) body.response_format = { type: 'json_object' }

console.log(`\n→ ${model}  max_tokens=${maxTokens}  thinking=${has('thinking') ? 'ON' : 'off'}`)

const t0 = Date.now()
let res
try {
  res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
} catch (err) {
  console.error(`\n[×] 没发出去：${err?.message ?? err}\n`)
  process.exit(1)
}

const text = await res.text()
const ms = Date.now() - t0

if (!res.ok) {
  console.error(`\n[×] HTTP ${res.status}\n${text.slice(0, 600)}\n`)
  process.exit(1)
}

const json = JSON.parse(text)
const u = json?.usage ?? {}
const inTok = u.prompt_tokens ?? 0
const outTok = u.completion_tokens ?? 0
const reasonTok = u.completion_tokens_details?.reasoning_tokens ?? 0
const cost = (inTok / 1e6) * PRICE_IN + (outTok / 1e6) * PRICE_OUT

console.log(`\n${json?.choices?.[0]?.message?.content ?? '(空)'}\n`)
console.log(`HTTP ${res.status}  ${ms}ms`)
console.log(`输入 ${inTok} / 输出 ${outTok}${reasonTok ? `（其中思考 ${reasonTok}）` : ''}`)
console.log(`本次约 $${cost.toFixed(6)}  ≈ ¥${(cost * 7.2).toFixed(4)}`)

if (reasonTok > 0) {
  console.log('\n[!] 有思考 token —— 这次贵在这儿，检查是否漏了 thinking: disabled')
}

// 本地账本，落在 .llm-usage.local.json（*.local 已在 .gitignore 里）
let ledger = { calls: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 }
if (existsSync(ledgerPath)) {
  try {
    ledger = { ...ledger, ...JSON.parse(readFileSync(ledgerPath, 'utf8')) }
  } catch {
    /* 账本坏了就重开 */
  }
}
ledger.calls += 1
ledger.tokens_in += inTok
ledger.tokens_out += outTok
ledger.cost_usd += cost
ledger.updated_at = new Date().toISOString()
writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))

console.log(
  `\n累计：${ledger.calls} 次 / 输入 ${ledger.tokens_in} / 输出 ${ledger.tokens_out} / 约 ¥${(ledger.cost_usd * 7.2).toFixed(2)}`,
)
console.log(`账本：${ledgerPath}\n`)
