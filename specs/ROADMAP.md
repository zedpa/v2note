# 念念有路 核心场景路线图 v3.0

> 基于产品设计 + 代码审计 + 架构缺口分析 + Agent 能力规划。
> 每个场景对应一个 `specs/` 文件，按 Given/When/Then 格式。

## 全景链路

```
混沌输入 → Agent整理 → 结构涌现 → AI洞察 → 行动闭环
   ✅         ✅           ✅          ✅        🔄重构中
                ↑
          Agent 工具层 + Plan 机制（✅已完成）
```

## 开发顺序

```
Phase 1: 数据质量 + 快速感知（Week 1-2）
  source-type-weight      source_type 权重全链路 + cluster_member 统一
  cold-start-bonds        冷启动浅层关联（第6条日记就能看到关联）
  cluster-tag-sync        Cluster 标签反写日记

Phase 2: 冷启动 + 报告通路（Week 3-4）
  cold-start-onboarding   冷启动 5 问（升级现有 3 问）
  cognitive-report        认知报告 + 每日回顾数据源

Phase 2.5: Agent 基础能力（Week 4-6）⚡新增
  agent-tool-layer        工具层重构——整合13个工具 + 原生function calling + 自主度分级
  agent-plan              Plan机制——多步编排 + 持久化 + 状态机 + 确认协议
  agent-web-tools         联网工具——搜索 + URL抓取 + Ingest管道对接

Phase 3: 结构能力（Week 6-8）
  top-level-dimensions    顶层维度——预设骨架 + 涌现填充
  emergence-chain         完整涌现链 L1→L2→L3

Phase 4: 认知→行动闭环（Week 8-12）🔄重构
  todo-strike-bridge      数据桥梁——todo.strike_id + goal.cluster_id 统一模型
  smart-todo              智能待办——自然语言全生命周期管理（核心体验）
  goal-lifecycle          目标全生命周期——前端+关联+追踪+涌现+状态流转

  ※ 架构决策：todo/goal 不再是独立实体，而是 Strike/Cluster 的行动投影
  ※ todo-strike-bridge 最先做（纯后端地基），然后 smart-todo + goal-lifecycle 可并行
  ※ smart-todo 依赖 Agent Plan 能力（目标拆解 = Plan 驱动）

Phase 5: 深度体验（Week 11-13）
  advisor-context         参谋上下文合并
  reader                  阅读器
  annotation              批注系统
  agent-self-evolution    Agent自适应——交互偏好学习 + Soul守护

Phase 6+: 增强与扩展
  knowledge-lifecycle     知识生命周期管理
  person-profile          人物画像系统
  decision-template       决策模板涌现
  mobile-action-panel     移动端行动面板完善
  external-integration    外部数据源集成
```

## Spec 统计

| Phase | Spec 数 | 场景数 | 状态 |
|-------|---------|--------|------|
| Phase 1 | 3 | 16 | ✅ |
| Phase 2 | 2 | 11 | ✅ |
| Phase 2.5 | 3 | 30 | ✅ |
| Phase 3 | 2 | 10 | ✅ |
| Phase 4 | 3 | 21 | ✅ |
| Phase 5 | 4 | 24 | ✅ |
| Phase 6+ | 5 | 17 | 🟡 |
| **总计** | **23** | **127** | |

## 已完成

- `strike-extraction.md` — ✅ Phase 1 规则引擎实现
- `source-type-weight.md` — ✅ source_type 权重全链路 + cluster_member 统一
- `cold-start-bonds.md` — ✅ 冷启动浅层关联 + 日记级聚合
- `cluster-tag-sync.md` — ✅ Cluster 标签反写日记
- `cold-start-onboarding.md` — ✅ 冷启动 5 问 + 立即 Digest + UserProfile 扩展
- `cognitive-report.md` — ✅ 认知报告 + 晨间/晚间注入 + Digest 重试
- `agent-tool-layer.md` — ✅ 工具层补全 (cluster搜索 + unmet_request + web工具注册)
- `agent-plan.md` — ✅ Plan 机制 (持久化 + executor + 状态流转)
- `agent-web-tools.md` — ✅ 联网工具 (web_search + fetch_url + URL安全 + 搜索服务抽象)
- `top-level-dimensions.md` — ✅ 顶层维度 (预设骨架 + embedding 匹配 + L3 Cluster)
- `emergence-chain.md` — ✅ 完整涌现链 (level 字段 + L2 聚合 + daily-cycle 集成)
- `todo-strike-bridge.md` — ✅ 数据桥梁 (todo.strike_id + goal.cluster_id + intend投影 + 双向一致性 + archive保护)
- `smart-todo.md` — ✅ 智能待办 (粒度判断 + 时间/优先级提取 + digest-prompt增强 + 重复检测)
- `goal-lifecycle.md` — ✅ 目标全生命周期 (健康度四维 + 涌现目标 + 状态流转 + 行动事件 + 时间线)
- `advisor-context.md` — ✅ 参谋上下文合并 (认知注入chat + 目标讨论 + 矛盾展开 + 引用区分 + 对话保存)
- `reader.md` — ✅ 阅读器 (阈值检测 + 排版配置 + 工具栏 + 问路路 + 回顾格式化 + 素材模式)
- `annotation.md` — ✅ 批注系统 (高亮Strike + 批注record + 素材想法 + 管理)
- `agent-self-evolution.md` — ✅ Agent自适应 (Soul严格门控 + Plan偏好提取 + 偏好衰减 + unmet聚合 + Profile分类)
