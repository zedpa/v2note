# ACTIVE_TASKS.md — 前端 P2: 认知地图打磨

> 前置：P0 行动面板 ✅ / P1 纯净入口 ✅ / P2-P4 骨架代码已提交
> 问题：组件已有但 cluster 数据为空，交互细节未打磨，导航链未完整串联
> 目标：让用户能从录音到认知地图到决策工作台走通完整闭环

---

## TASK-P2-01: 数据通路——确保 Digest 产出 Strike 后 Cluster 能涌现

**复杂度**: M
**问题**: 验证显示 /cognitive/clusters 返回空数组。因为 daily cognitive cycle 还没跑过。

**具体任务**:
1. 手动触发一次 daily cognitive cycle（写一个测试脚本）
2. 验证 seed 的 7 个 Strike + 5 个 Bond 能否产生 cluster
3. 如果 Strike 数量不够触发聚类（三角密度阈值 > 0.3），降低阈值或补充更多测试数据
4. 确保 /cognitive/clusters API 能返回有内容的列表
5. 确保 /cognitive/clusters/:id API 能返回成员 + 矛盾 + 模式

**验收标准**:
- [ ] /cognitive/clusters 返回 ≥ 1 个 cluster
- [ ] /cognitive/clusters/:id 返回成员列表 + 特征

---

## TASK-P2-02: Level 0 人生全景——Cluster 卡片真实渲染

**复杂度**: S
**前置**: P2-01

**具体任务**:
1. LifeMap 组件已有，但需要验证真实数据渲染
2. 确保活跃度圆点根据 memberCount 正确计算
3. 空态文案已有（"认知世界还在萌芽中"）
4. 添加下拉刷新手势（pull-to-refresh）
5. Playwright 截图验证有数据时的卡片墙渲染

**验收标准**:
- [ ] 有 cluster 数据时，卡片墙正确渲染
- [ ] 活跃度圆点 1-4 个正确填充
- [ ] 截图确认

---

## TASK-P2-03: Level 1 → Level 2 导航串联

**复杂度**: M
**前置**: P2-01

**具体任务**:
1. 当前 LifeMap 的 onSelectCluster 直接跳到 ClusterDetail（Level 2），跳过了 Level 1
2. 评估：如果顶层 cluster 本身就是最终主题（没有子 cluster），Level 1 可以跳过
3. 如果需要 Level 1：新建 cluster-wall.tsx，显示某领域下的子 cluster
4. ClusterDetail 需要验证：模式区、对立观点区、目标状态区、时间线区都能渲染
5. 对立观点的"帮我想想"按钮 → DecisionWorkspace 跳转已有，验证能否触发

**验收标准**:
- [ ] 从 LifeMap 点击 cluster 卡片 → ClusterDetail 正确打开
- [ ] ClusterDetail 四个区域根据数据有无条件渲染
- [ ] 对立观点 → DecisionWorkspace 跳转正常

---

## TASK-P2-04: 认知地图入口优化

**复杂度**: S

**具体任务**:
1. Brain 图标已有（右上角），但下拉手势进入地图还未实现
2. 评估：在 Level -1 纯净入口添加下拉手势进入 LifeMap
   - onPointerDown/Move/Up，检测向下拖动 > 50px → setCognitiveMapOpen(true)
3. 或者：保持 Brain 图标入口即可，下拉手势可以后做
4. 纯净入口的关联提示（LinkHint）需要有数据写入 localStorage：
   - 在 Digest 完成后，通过 WebSocket 推送或在 API 响应中附带 lastLinkHint
   - 暂时方案：在 use-action-panel 或 gateway-client 中，每次 process 完成后写入 localStorage

**验收标准**:
- [ ] Brain 图标点击正常打开认知地图
- [ ] 关联提示有数据时正确显示并 fade out

---

## TASK-P2-05: 决策工作台（Think）数据验证

**复杂度**: M
**前置**: P2-01

**具体任务**:
1. DecisionWorkspace 已有骨架，但 POST /api/v1/chat/decision 端点可能不存在
2. 检查 chat.ts 中 decision 模式的触发方式——当前是通过 startChat(mode='decision')
3. 需要新建一个简化的 REST 端点 POST /api/v1/chat/decision：
   - body: { question: string }
   - 内部调用 gatherDecisionContext + buildDecisionPrompt + chatCompletion
   - 返回 { content: string }（AI 分析结果）
4. 验证 parseSections 能正确解析 AI 返回的结构化文本

**验收标准**:
- [ ] POST /chat/decision 返回结构化分析
- [ ] DecisionWorkspace 渲染支持/反对/缺口/模式四区域
- [ ] "继续和 AI 讨论"按钮可点击

---

## TASK-P2-06: Playwright 截图验证全链路

**复杂度**: S
**前置**: P2-01 ~ P2-05

**具体任务**:
1. Seed 充足测试数据（包含 cluster + contradiction + pattern）
2. Playwright 自动化：
   - 登录 → 纯净入口截图
   - Brain 按钮 → 认知地图截图
   - 点击 cluster → Detail 截图
   - 点击"帮我想想" → 决策工作台截图
   - 上滑 → 行动面板截图
3. 所有截图保存到 scripts/screenshots/

**验收标准**:
- [ ] 6 张截图覆盖完整导航链
- [ ] 每张截图有实质内容（非空白/非报错）

---

## 执行顺序

```
P2-01（数据通路）→ P2-02（Level 0 渲染）
                 → P2-03（导航串联）
                 → P2-04（入口优化）
                 → P2-05（决策端点）
                 → P2-06（截图验证）
```

P2-01 是前置。P2-02 到 P2-05 可并行。P2-06 最后。
