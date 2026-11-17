import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  /**
   * key 只在 Node 侧（这个配置文件里）读一次：
   * loadEnv 的第三个参数传 '' 才会读到非 VITE_ 前缀的变量；
   * 浏览器拿到的只有 /api/llm/*，永远看不到 key。
   */
  const env = loadEnv(mode, process.cwd(), '')
  const apiKey = env.DEEPSEEK_API_KEY ?? process.env.DEEPSEEK_API_KEY ?? ''

  if (!apiKey) {
    console.warn('[proxy] 没读到 DEEPSEEK_API_KEY（.env.local 或进程环境变量），/api/llm 会被 DeepSeek 拒绝')
  }

  return {
    plugins: [react(), tailwindcss()],
    // host: true 是为了让手机在同一局域网里直接打开 dev server 调试（主设备是手机）
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api/llm': {
          target: 'https://api.deepseek.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/llm/, ''),
          timeout: 120_000,
          proxyTimeout: 120_000,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // 每个请求都覆盖一次：客户端就算自己带了 Authorization 也会被这里替换掉
              if (apiKey) proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
            })
          },
        },
      },
    },
    build: { target: 'es2020' },
  }
})
