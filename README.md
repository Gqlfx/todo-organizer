# 待办整理器 · 工作区

**开工只看这一份** → `docs/规格-待办整理器-v1.0.md`
**派活话术 + 验收** → `prompt_kit/待办整理器-V0.1-启动包.md`

`docs/archive/` 是 v0.1–v0.4 的讨论过程（含被否掉的方案）。
**不要按它开发**，只在需要回答"为什么当初这么定"时查阅。

## 三条硬约束

1. **v1.0 已冻结**，不再重新设计；任何新想法记进 V0.1.1，不进首版
2. **V0.1 只有六件事，8–10 天**，按开工顺序卡逐日推进
3. **技术栈已定**：Vite + React + TS + Tailwind + Dexie + dnd-kit + Capacitor
   —— 不引入 Next.js、SQLite、任何云服务、任何账号体系

## 一句话定位

随口输入 → 自动分档 → 一条今天能做完的队列。
不是日历，不是课表，不是团队协作工具。

## 本地跑起来

```bash
cd C:/Users/syq/WorkBuddy/2026-11-15-22-47-03
npm install
npm run dev        # 打开 http://localhost:5173
npm run build      # 类型检查 + 生产构建
```

手机调试：同一 Wi-Fi 下用终端里打印的 Network 地址打开（dev server 已开 `host: true`）。

## 当前进度（Day 1–9）

- Dexie 两张表：`tasks` / `settings`，外加只追加的 `corrections`（库名 `todo-organizer`，纯本地）
- 队列页（默认 Tab）：输入框、固定行、空档线、任务卡、尽力线、已完成区、明天区
- 全部页：按档位分组（现在/今天/本周/以后）+ 条数 + 总估时 + 双向改档（挪到今天 / 挪到本周）
- 输入解析：建卡 → 后台 `/api/llm` → 按 `raw_index` 合并（`src/lib/llm.ts` + `src/lib/parse.ts`）
- 分档：同一批新任务只发一次 `/api/bucket`，失败留 `today`、不弹窗（`src/lib/bucket.ts`）
- 完成：点卡片左侧圆圈 → `status=done`，立刻消失，底部「今天已完成 N 件」可展开撤销
- 顺延：溢出首条可「挪到明天」→ `plan_date` 挪到下一个装得下的日子，`defer_count + 1`
- 设置页：七天容量（柱状图 + 单日编辑）、四个工作日预设、今天特殊覆盖
  - 拖滑杆时柱状图和顶部「今日可用」实时跟手，松手才写库（`src/lib/useDraftNumber.ts`）
- 默认七天容量（分钟）：60 / 120 / 150 / 240 / 120 / 300 / 300，按真实课表第 10 周实测
- 空档阈值 `min_gap_min = 10`：<10 丢弃、10–30 只放短任务、≥30 整块（`src/lib/fill.ts`）
- Dexie v4 迁移：新增 `corrections` 表（只增不改）
- 备份：导出 / 导入 JSON（覆盖式），7 天没备份起会在队列顶部提醒（写实际天数）
- 原生：Capacitor 8，包名 `com.syq.todo`；AI Key 输入、`llm.ts` 双分支、导出走 Filesystem 已接（见下节）
- 打包：`.github/workflows/build-apk.yml` 手动触发，`assembleDebug` + upload-artifact
- 尚未做：通知、四象限、拖拽与锁定（V0.1.1）

## 「全部」页

- 第三个 Tab；按 `bucket` 分组：现在 / 今天 / 本周 / 以后，每组显示条数与总估时
- 两个方向的按钮：
  - **本周 / 以后** → 「挪到今天」（`bucket='today'`，**同时清空 `plan_date`**）
  - **现在 / 今天** → 「挪到本周」（`bucket='week'`，从今天的队列里撤走）
- 固定事件不给改档按钮：它有时间段，改档只是把它从今天时间轴上抹掉，时间并没变
- 两个方向都在 `corrections` 里追加一条 `{ title, from_bucket, to_bucket, at }`，
  这是 V0.1 里 AI 分档唯一的学习信号（V0.1 不做拖拽）

自检（控制台）：

```js
await __todo.db.corrections.toArray()        // 每次「挪到今天」的记录
await __todo.db.tasks.toArray()              // 看 bucket 是否已变 today
```

## 输入是怎么被解析的
- 提交后**立刻建卡**（乐观入队，卡片秒出），后台再请求 `/api/llm/chat/completions`
- 契约：`{ "items": [{ "raw_index", "title", "due_at", "start_at", "end_at", "est_min", "is_fixed" }] }`
  - 没提时间一律 `null`，不猜；`end_at` 只在明确说了结束时间时才有值
  - `est_min` 只接受 5 的倍数，缺失由上层补 30
  - `is_fixed` 只在「有明确开始 + 独占一段时间」时为 true（开会/上课/面试）
- 解包三层：顶层 `content` → `items` 数组 → 每条 `raw_index` 合法且在行号范围内；任一层失败整批降级
- 解析失败、超时、断网、模型漏行 → 卡片**保留**并标「未定时间」，数据一条不丢
- `parse_confidence`：`0` = 没解析成功、`null` = 从未尝试（老数据/手建）、`1` = 已解析
- 未来的固定事件（如「下周三开会」）不会从队列消失，进底部「之后 N 件」

开发期不烧请求：打开 `http://localhost:5173/?llm=fixture`，走
`src/lib/__fixtures__/parse.sample.json`，不调模型（只在 DEV 生效）。

## 分档（/api/bucket）

- **批量**：一次提交最多 8 条，超过则按 8 条分块；一次提交只发 1 次分档请求
- 只处理本次新增，不做全量重排；存量任务靠「全部」页手动挪（重新分档按钮还没做）
- 输入：`now`、`new_tasks`、`load{counts, today_minutes, capacity_min, gap_total_min, slack_min, nearest_due}`、
  最近 10 条 `corrections`、`prefs`
- 输出：`{ items: [{ id, bucket, reason }] }`
  - id 不在输入里 → 丢弃；缺的 → `today`；非法 bucket → `today`
  - `reason` 截到 20 字，存进 `bucket_reason`（暂不展示）
- system prompt 只剩三条硬规则：截止 3 天内 → 至少 today；没提时间 → today；age>3 → 至少 today
- `gap_total_min` 只作 reason 素材（如「今日空档 0 分钟」），**不得据此改档位**
- 失败、超时、结构不对 → 全部留在 `today`，不阻塞输入、不弹窗
- 代价：一次提交 = 2 次模型调用（parse + bucket）

自检（控制台）：

```js
console.table((await __todo.db.tasks.toArray()).map((t) => ({
  title: t.title, bucket: t.bucket, reason: t.bucket_reason,
})))
```

## 队列怎么用

- 输入框在顶部常驻：回车入队；一次粘多行 = 多条任务；Shift+回车 才换行
- 新任务固定为：档位 `today`、估时 30 分钟、无截止、无计划日、来源 `ai`、状态 `todo`
- 排序：档位 now > today > week > later → 截止升序（无截止排最后）→ 估时升序
- 两轮装填：先把整块（≥30 分钟）装任务，剩余短任务回填碎片（10–30 分钟）
- 排到当天容量为止，画「今天到此为止」，线下任务标「明天」
- 顶部第二行有三态：`今天还能排 X` / `今天排满了`（容量用完）/ `今天已收工`
  （离 `work_end` 不足 `min_gap_min` 就算收工，右侧改显示「明天 08:00 开始」）。
  22:58 时不会再写「还能排 2 分钟」——那个数字排不下任何任务，只会误导
- `plan_date`（我打算哪天做）：`null` = 今天；`<= 今天`（含逾期）都会出现在今天的队列
- 固定事件缺 `end_at` 时按 `est_min ?? 60 分钟` 兜底；点固定行右侧时间可改结束时刻，改完 `is_locked`
- `is_fixed` 但连 `start_at` 都没有的事件，降级成普通任务卡，不会消失

## 备份（导出 / 导入）

- 设置页「备份」卡：导出 JSON / 导入 JSON
- 文件名 `todo-YYYY-MM-DD.json`，内容：
  `{ app, version, exportedAt, data: { tasks, settings, corrections } }`
  - `version` 取的是 Dexie 当前版本（现在是 4）
  - `exportedAt` 带本地时区偏移，不是 `Z`
- `settings.ai_key` 永远写成空字符串；导入时也用本机原值，不读文件里的
- 导入是**覆盖式**：先清空 tasks / settings / corrections 再写，不做合并
- 版本高于当前直接拒绝（提示先升级应用）；`app` 不对直接拒绝
- 导入前弹一次确认：「会用文件里的 N 条任务替换现有 M 条，不可撤销」——
  全项目唯一该弹的确认框，因为它不可逆
- 队列页顶部会挂一行灰字提醒（点一下直接导出并刷新时间），空库不显示——新用户第一眼不该被催：
  - 7–29 天：「N 天没备份」，写实际天数
  - ≥30 天：「一个多月没备份」（拖那么久，精确天数已经没人信了）
  - 从没导出过：「还没备份过」

导入后自检（控制台）：

```js
await __todo.db.tasks.count()          // 应与文件里的任务数一致
await __todo.db.corrections.count()    // 纠正记录也回来了
await __todo.db.settings.get(1)        // day_capacity 是你改过的值；ai_key 仍是本机值
```

## 打包（Android，走 GitHub Actions）

本机不装 JDK / Android SDK，出包交给 CI。仓库里的 `android/` 要提交：根 `.gitignore` 已放行它，
构建产物由 `android/.gitignore` 自己挡掉（`.gradle/`、`build/`、`assets/public`、生成的 config）。

`.github/workflows/build-apk.yml`，`workflow_dispatch` 手动触发。编译流程：

```bash
npm ci
npm run build
npx cap sync android
chmod +x android/gradlew        # Windows 提交会丢可执行位
cd android && ./gradlew assembleDebug --no-daemon
```

CI 上有三个坑，都已经在 workflow 里绕过了：

1. **不要用 `android-actions/setup-android@v3`**：它会执行 `sdkmanager tools`，而 `tools` 包在新版
   SDK 里已废弃 → `Failed to find package 'tools'` → 步骤直接 exit 1。ubuntu-latest 本来就预装了
   SDK（`ANDROID_HOME=/usr/local/lib/android/sdk`），直接用即可。
2. **JDK 必须是 21，不是 17**：`android/app/capacitor.build.gradle` 写死
   `JavaVersion.VERSION_21`，而这个文件每次 `cap sync` 都会重写，改不动。
3. **`gradlew` 的可执行位**：Windows 提交会丢（index 里是 100644）。除了 CI 里 `chmod +x`，
   本地也用 `git update-index --chmod=+x android/gradlew` 把索引里的位改成 100755。

出包之后：

1. `upload-artifact` 存一份原名 `app-debug.apk`（Actions 页面可下载；要看旧包靠它）
2. 拷两份进 `out/`：`app-debug-YYYYMMDD-HHMM.apk`（带构建时间）+ `app-debug.apk`（固定名）
3. `peaceiris/actions-gh-pages@v4` 推到 `apk` 分支，`force_orphan: true` 每次重建

手机下载：

```
# 总是最新（推荐 gcore 入口，本机实测 4.4 MB 完整下载）
https://gcore.jsdelivr.net/gh/Gqlfx/todo-organizer@apk/app-debug.apk

# 官方主域（部分网络不通，能连就用）
https://cdn.jsdelivr.net/gh/Gqlfx/todo-organizer@apk/app-debug.apk

# 某一次构建（文件名里的时间是 UTC）
https://gcore.jsdelivr.net/gh/Gqlfx/todo-organizer@apk/app-debug-20261117-1457.apk
```

> 实测：`cdn.jsdelivr.net` 与 `raw.githubusercontent.com` 在本地网络 TLS 握手失败，
> `gcore.jsdelivr.net` 正常。三个是同一个 CDN 的不同入口，内容一致。

- **固定名那份是必须的**：只留时间戳的话，收藏下来的地址每次构建都会 404
- **`force_orphan` 也是必须的**：APK 进 git 历史等于仓库无限膨胀，攒到几百 MB jsDelivr 就不服务了
- debug 包必须 < 20 MB；推送后等 3–5 分钟再点链接
- `permissions: contents: write` 是 push 到分支的前提，少了会 403

包名 `com.syq.todo`、应用名「待办」写在 `android/app/build.gradle` 与 `values/strings.xml` 里，
`npx cap sync` 不会覆盖它们。

> WorkBuddy 沙箱禁止删除非空目录，`cap sync` 重建 `assets/public` 时会卡在 safe-delete。
> 本机重跑前先把这两个生成目录清成空壳，再 sync：
>
> ```bash
> find android/app/src/main/assets/public android/capacitor-cordova-android-plugins \
>   -type f -delete 2>/dev/null
> find android/app/src/main/assets/public android/capacitor-cordova-android-plugins \
>   -depth -type d -exec rmdir {} + 2>/dev/null
> npx cap sync
> ```
>
> CI 上是普通文件系统，不需要这一步。

真机怎么验：`prompt_kit/待办整理器-真机验收卡.md`（四条，含每条失败怎么判）。

## 原生适配（APK 里和浏览器不一样的三处）

| 能力 | 浏览器（`npm run dev`） | 原生（APK） |
|---|---|---|
| 模型请求 | `/api/llm/*` 走 Vite proxy，key 在 Node 侧 | 直连 `api.deepseek.com`，`Authorization` 用设置页存的 key |
| key 从哪来 | `.env.local` 的 `DEEPSEEK_API_KEY` | 设置 → AI Key（存 IndexedDB，导出备份时写成空） |
| 导出备份 | `Blob + <a download>` | 写进 app 缓存目录，再交给系统分享面板 |
| 系统栏安全区 | 不需要（浏览器有边框） | `SystemBars.insetsHandling = 'native'`，原生给 WebView 加内边距 |

- `capacitor.config.ts` 开了 `CapacitorHttp`：原生里 fetch 由原生代发，绕开 CORS。
  副作用是**原生下只认绝对 URL**——`llm.ts` 里做了双分支，别往原生分支里塞相对路径。
- CapacitorHttp 接管的 fetch 不一定认 `AbortSignal`，`chat()` 额外用 `Promise.race` 压超时，
  保证原生下也能按期失败。
- 导出目录用 `Directory.Cache` 而不是 `Documents`：Android 11+ 的公共 Documents 需要
  `MANAGE_EXTERNAL_STORAGE`，普通应用写不进去。Cache 私有、零权限，用户通过分享面板决定最终去处。
- 分享用 `Share.share({ files: [uri] })`，不是 `url`——前者是「分享文件」，走 FileProvider，
  `file_paths.xml` 里已有 `cache-path`。
- 没填 key 时原生分支直接抛「还没填 AI Key（设置 → AI）」，不静默；401/403 会额外提示
  「AI Key 不对或已失效」。
- 原生插件（`@capacitor/filesystem` / `@capacitor/share`）走动态 import，浏览器包里只有
  几百字节的空壳 chunk。

> 这两条 native 分支在本机跑不了（没有模拟器），只能靠真机验。web 侧回归 14 项已过。

## 造测试数据（还没有录入 UI 的部分）

固定事件（课/会）、10 分钟短任务、指定计划日的任务目前都没有录入界面，`npm run dev` 时控制台可用：

```js
// 固定事件：is_fixed + 起止时间（本地时间，可省日期表示今天）
await __todo.addTask({
  title: '电路实验',
  is_fixed: true,
  start_at: '2026-11-16T15:00',
  end_at: '2026-11-16T16:00',
})

// 10 分钟任务（用来验“碎片空档能塞进去”）
await __todo.addTask({ title: '取快递', est_min: 10 })

// 指定计划日（"2026-11-15" = 昨天 → 逾期，今天必须出现）
await __todo.addTask({ title: '逾期的事', plan_date: '2026-11-15' })
await __todo.addTask({ title: '明天的事', plan_date: '2026-11-17' })

// 盖满今天（验「今天装不下」时用：必须盖到 work_end，否则尾巴还排得下）
const d = new Date().toLocaleDateString('sv-SE')
await __todo.addTask({ title: '上午课', is_fixed: true, start_at: `${d}T08:00`, end_at: `${d}T12:00` })
await __todo.addTask({ title: '下午课', is_fixed: true, start_at: `${d}T12:00`, end_at: `${d}T17:00` })
await __todo.addTask({ title: '晚上课', is_fixed: true, start_at: `${d}T17:00`, end_at: `${d}T23:00` })
```

这个口子只在开发环境安装（`import.meta.env.DEV`），`npm run build` 的产物里没有。

数据在哪：浏览器 IndexedDB。要清空重来，DevTools → Application → IndexedDB → 删除 `todo-organizer`。

