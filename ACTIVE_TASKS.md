# ACTIVE_TASKS.md — 前端 P5: 冷启动 + 手动连接

---

## TASK-P5-01: 冷启动播种对话

**复杂度**: M
**涉及文件**: 新建 features/cognitive/components/onboarding-seed.tsx, app/page.tsx

首次使用（无 Strike 数据时）显示引导式对话而非空白。
三个引导问题→录音/打字→转化为初始 Strike。

---

## TASK-P5-02: 手动连接交互（Cluster 级别）

**复杂度**: M
**涉及文件**: features/cognitive/components/life-map.tsx

Level 0 地图中，长按 Cluster 卡片→拖线到另一个 Cluster→创建 bond。
后端已有 bondRepo.create，前端需要手势+视觉反馈+API 调用。

---

## TASK-P5-03: Playwright 验证

截图验证冷启动和手动连接。

---

## 执行顺序

P5-01 + P5-02 并行（不同文件）→ P5-03
