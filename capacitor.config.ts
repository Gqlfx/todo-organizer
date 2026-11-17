import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.syq.todo',
  appName: '待办',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  plugins: {
    /**
     * 原生里没有 Vite proxy，请求得直连 api.deepseek.com。
     * 打开 CapacitorHttp 后，WebView 的 fetch 由原生代发，绕开 CORS——
     * 不然直连会被浏览器的同源策略挡死。
     * 副作用：原生下 fetch 只认绝对 URL，相对路径 /api/llm 会失败（见 llm.ts 的双分支）。
     */
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
