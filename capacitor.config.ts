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
    /**
     * Android 15+ 强制 edge-to-edge，WebView 会铺到状态栏和导航栏下面。
     * 默认的 'css' 靠 env(safe-area-inset-*)，而安卓 WebView 对它的支持不稳（常返回 0）。
     * 'native' 让 Capacitor 直接给 WebView 设 padding，不依赖 CSS 能力。
     */
    SystemBars: {
      insetsHandling: 'native',
    },
  },
}

export default config
