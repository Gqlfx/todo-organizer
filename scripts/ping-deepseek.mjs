// 用途：验证 DeepSeek key 能不能用、模型名对不对、thinking 关掉后返回长什么样。
// 跑法：node scripts/ping-deepseek.mjs
// 说明：这是 Node 环境，没有 CORS 限制。它只验证 key 与模型，不验证浏览器能否直连。

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env.local')

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

const env = loadEnv(envPath)
const key = (env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || '').trim()
const baseUrl = (env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')
const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash'

if (!key) {
  console.error('\n[×] 没读到 key。')
  console.error(`    文件：${envPath}`)
  console.error('    请在 DEEPSEEK_API_KEY= 后面填上你的 key，保存后重跑。\n')
  process.exit(1)
}

console.log('\n[1/3] 读取配置')
console.log(`    endpoint : ${baseUrl}/chat/completions`)
console.log(`    model    : ${model}`)
console.log(`    key      : ${key.slice(0, 6)}…${key.slice(-4)}  (${key.length} 字符)`)

const body = {
  model,
  messages: [{ role: 'user', content: '只回四个字：连接成功' }],
  max_tokens: 32,
  stream: false,
  thinking: { type: 'disabled' },
}

console.log('\n[2/3] 发请求…')
const started = Date.now()

try {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })

  const text = await res.text()
  const ms = Date.now() - started
  console.log(`    HTTP ${res.status}  ${ms}ms`)

  if (!res.ok) {
    console.error('\n[×] 请求被拒。原始返回：\n')
    console.error(text.slice(0, 800))
    console.error('\n常见原因：key 无效或过期（401）、余额不足（402）、模型名不对（400/404）。\n')
    process.exit(1)
  }

  let json
  try {
    json = JSON.parse(text)
  } catch {
    console.error('\n[×] 返回不是 JSON：\n')
    console.error(text.slice(0, 800))
    process.exit(1)
  }

  const content = json?.choices?.[0]?.message?.content ?? '(空)'
  const reasoning = json?.choices?.[0]?.message?.reasoning_content
  const usage = json?.usage ?? {}

  console.log('\n[3/3] 结果')
  console.log(`    模型回复 : ${content}`)
  if (reasoning) console.log(`    [!] 仍有思考内容，说明 thinking 没关掉：${String(reasoning).slice(0, 60)}…`)
  console.log(`    token    : 输入 ${usage.prompt_tokens ?? '?'} / 输出 ${usage.completion_tokens ?? '?'}`)

  const cached = usage.prompt_cache_hit_tokens
  if (typeof cached === 'number') console.log(`    缓存命中 : ${cached}`)

  console.log('\n[√] key 与模型都可用。可以去配 vite proxy 了。\n')
} catch (err) {
  const ms = Date.now() - started
  console.error(`\n[×] 请求没发出去（${ms}ms）。`)
  console.error(`    ${err?.name ?? 'Error'}: ${err?.message ?? err}`)
  console.error('\nNode 环境没有 CORS，所以这不是跨域问题。排查顺序：')
  console.error('    1. 能不能打开 https://api.deepseek.com')
  console.error('    2. 是否挂了系统代理 / 公司网络限制')
  console.error('    3. key 里有没有混进空格或换行\n')
  process.exit(1)
}
