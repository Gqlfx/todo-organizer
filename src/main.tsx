import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// 本地优先的单机应用：能要到持久化存储就尽量要，降低手机端 IndexedDB 被清掉的概率。
void navigator.storage?.persist?.().catch(() => undefined)

// 仅开发环境：暴露 __todo.addTask，用来造固定事件和 10 分钟短任务（Day 3-4 没有对应 UI）。
if (import.meta.env.DEV) {
  void import('./dev/bridge').then((mod) => mod.installDevBridge())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
