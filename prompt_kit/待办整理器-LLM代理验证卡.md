# 待办整理器 · LLM 代理与参数验证卡

> 用途：换机器 / 换 key 之后，5 分钟内确认代理还通、模型参数还被接受。
> 前置：`.env.local` 里有 `DEEPSEEK_API_KEY`（无 VITE_ 前缀），`npm run dev` 已起。

## 一、代理配置（已完成）

- `/api/llm` → `https://api.deepseek.com`，`rewrite` 去掉 `/api/llm` 前缀
- key 只在 `vite.config.ts` 里用 `loadEnv(mode, cwd, '')` 读取（第三个参数传 `''`，
  否则非 `VITE_` 变量读不到），浏览器永远拿不到
- 已验：浏览器内 fetch 返回 200；DOM / `/src/main.tsx` / `window` 都不含 key

## 二、参数对齐（实测）

```bash
curl -sS -X POST http://localhost:5173/api/llm/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-flash",
    "messages": [{"role":"user","content":"把这句拆成 JSON：周四前把方案给老板，买猫粮"}],
    "thinking": {"type": "disabled"},
    "response_format": {"type": "json_object"},
    "max_tokens": 300
  }'
```

实测结论：

| 检查项 | 结果 |
|---|---|
| `model=deepseek-flash` | 200，响应里的 `model` 也是 `deepseek-flash` |
| `thinking: {"type":"disabled"}` | 被接受（无 400），且真的生效 |
| `response_format: {"type":"json_object"}` | 支持，返回体 `content` 是合法 JSON |
| `usage.reasoning_tokens` | 关闭后**没有**该字段；对照组有 294 |

注意：`json_object` 只保证「是 JSON」，不保证符合自定义契约。实测模型会自作主张包一层
`{"type":"json_object","content":{...}}` —— 契约必须写进 system prompt。

## 三、对照组（去掉 thinking，证明参数真的生效）

```bash
curl -sS -X POST http://localhost:5173/api/llm/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "deepseek-flash",
    "messages": [{"role":"user","content":"把这句拆成 JSON：周四前把方案给老板，买猫粮"}],
    "response_format": {"type": "json_object"},
    "max_tokens": 300
  }'
```

对照组结果：`completion_tokens=300`（打满）、`reasoning_tokens=294`、
`message.reasoning_content` 有值、`content` 被截断成半截 JSON。

结论：`max_tokens=300` 的预算下必须显式关 thinking，否则一半预算被思考吃掉。

## 四、报错判读

| 现象 | 大概率原因 |
|---|---|
| 401 | key 没读到（`loadEnv` 第三参没传 `''`，或 `.env.local` 不在项目根） |
| 404 | `rewrite` 没去掉前缀，路径变成了 `/api/llm/chat/completions` |
| 502 | 出站网络 / DNS 不通 |
| 400 `invalid_request_error` | 参数名或取值不被接受，按报错原文改，不要改前端直连 |
