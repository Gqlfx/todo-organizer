# 待办整理器 · Day 5–6 验收卡

> 用途：确认「完成 / 顺延 / plan_date」三条真的走通。
> 前置：`npm run dev`，停在「队列」Tab（工作日默认容量 60 分钟，正好塞两条 30 分钟任务）。

## 一、五条验收

| # | 动作 | 预期 | 通过 |
|---|---|---|---|
| 1 | 建两条任务，点第一条左侧圆圈 | 卡片立刻消失（无弹窗无动画），底部出现「今天已完成 1 件」；展开后点「取消完成」能回到队列 | ☐ |
| 2 | 建三条任务，点溢出首条的「挪到明天」 | 立刻从今天消失，底部出现「明天 1 件 · 点开可拉回」；只有首条有按钮，其余没有 | ☐ |
| 3 | 刷新页面 | 那条不再出现在今天的队列里，「明天 1 件」仍在 | ☐ |
| 4 | 用下面片段建 `plan_date=昨天` 的任务 | 今天必须出现在队列里（逾期要浮上来） | ☐ |
| 5 | 用下面片段建 `plan_date=明天` 的任务 | 今天不出现在队列，只进底部「明天 N 件」 | ☐ |

## 二、造数据（还没有录入 UI 的部分）

浏览器控制台（仅 `npm run dev` 可用）：

```js
const pad = (n) => String(n).padStart(2, '0')
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const now = new Date()
const yesterday = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
const tomorrow = key(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))

await __todo.addTask({ title: '逾期的事', plan_date: yesterday })
await __todo.addTask({ title: '明天的事', plan_date: tomorrow })
```

## 三、顺手修的那条

把「一天的范围 → 结束时间」改成已经过去的时刻（比如现在 19:00，改成 00:01），
顶部「今天还能排」应当马上变成 **0 分钟** —— 而不是还写着「1 小时」。

## 四、回执（复制这段回我）

```
【Day 5-6 验收】
1 完成 → 消失 → 已完成 1 件 → 取消完成回队列：通过 / 不通过
2 溢出首条「挪到明天」→ 今天消失 + 明天 1 件：通过 / 不通过（按钮数 __）
3 刷新后明天那条不在今天：通过 / 不通过
4 plan_date=昨天 今天浮现：通过 / 不通过
5 plan_date=明天 今天不出现：通过 / 不通过
6 结束时间调到过去 → 还能排 0 分钟：通过 / 不通过

其他问题：
```
