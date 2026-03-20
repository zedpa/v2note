# ACTIVE_TASKS.md — 前端 P4: 穿越交互 + 决策工作台

---

## TASK-P4-01: 决策工作台端到端验证

**复杂度**: S
**已有代码**: decision-workspace.tsx + POST /chat/decision

验证"帮我想想"→ 决策工作台的完整链路。
需要 AI API 可用（DashScope）才能返回分析结果。

---

## TASK-P4-02: 穿越交互——行动面板卡片长按→地图定位

**复杂度**: M
**涉及文件**: now-card.tsx（添加长按）, app/page.tsx（接收穿越事件）

1. NowCard 添加长按手势（500ms）
2. 长按触发回调 onTraverse(strikeId)
3. app/page.tsx 接收 → 关闭行动面板 → 打开认知地图 → 定位到该 Strike 所属 cluster

---

## TASK-P4-03: Playwright 截图验证

验证：
1. ClusterDetail 的"帮我想想"按钮 → DecisionWorkspace 打开
2. 行动面板可见时截图

---

## 执行顺序

P4-01 + P4-02 并行 → P4-03
