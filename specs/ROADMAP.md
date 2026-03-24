# 念念有路 核心场景路线图 v3.0

> 基于产品设计 + 代码审计 + 架构缺口分析 + Agent 能力规划。
> 每个场景对应一个 `specs/` 文件，按 Given/When/Then 格式。

## 全景链路

```
混沌输入 → Agent整理 → 结构涌现 → AI洞察 → 行动闭环
   ✅        ⚠️打通       ⚠️补全       ⚠️连接      ⚠️闭环
                ↑
          Agent 工具层 + Plan 机制（新增）
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

Phase 4: 目标闭环（Week 8-11）
  goals-scaffold          目标场景前端骨架
  goal-granularity        目标粒度处理——快路径 + 慢路径
  goal-auto-link          目标自动拆解与关联
  action-tracking         行动事件追踪 + 反馈回流

  ※ Phase 4 大量依赖 Agent Plan 能力：
    目标拆解 = Plan(search → AI推理 → confirm → batch create)
    路径设定 = Plan(search → AI推理 → confirm → batch create)
    行动反馈 = Plan完成回调 → 自动触发结果追踪

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
| Phase 1 | 3 | 16 | 🟡 |
| Phase 2 | 2 | 11 | 🟡 |
| Phase 2.5 | 3 | 30 | 🟡 |
| Phase 3 | 2 | 10 | 🟡 |
| Phase 4 | 4 | 19 | 🟡 |
| Phase 5 | 4 | 24 | 🟡 |
| Phase 6+ | 5 | 17 | 🟡 |
| **总计** | **23** | **127** | |

## 已完成

- `strike-extraction.md` — ✅ Phase 1 规则引擎实现
