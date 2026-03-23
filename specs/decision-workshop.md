# 决策工坊（Decision Workshop）

> 状态：🟡 待开发

## 概述
当用户面对认知冲突时，提供结构化决策辅助。全屏展示支持方（绿）、反对方（红）、信息缺口（橙）、用户思维模式（紫）四个维度的证据，每项可溯源到原始 Strike。支持与 AI 顾问继续对话深入讨论。

## 场景

### 场景 1: 从矛盾对进入决策工坊
```
假设 (Given)  存在 contradiction Bond: "应该换供应商" ↔ "不该换，风险太大"
当   (When)   用户点击 "帮我想想"
那么 (Then)   打开全屏决策工坊
并且 (And)    自动定位到该矛盾主题 "供应商决策"
```

### 场景 2: 支持方证据收集（绿色区域）
```
假设 (Given)  决策工坊已打开，主题为 "换供应商"
当   (When)   系统收集支持方证据
那么 (Then)   绿色区域应列出所有支持 "换" 的 Strike
并且 (And)    每项显示: nucleus + 极性图标 + 来源日期
并且 (And)    每项可点击查看原始记录（溯源）
```

### 场景 3: 反对方证据收集（红色区域）
```
假设 (Given)  决策工坊已打开
当   (When)   系统收集反对方证据
那么 (Then)   红色区域应列出所有反对的 Strike
并且 (And)    包括 contradiction Bond 的对侧 Strike
并且 (And)    包括 perspective_of Bond 中持不同视角的 Strike
```

### 场景 4: 信息缺口识别（橙色区域）
```
假设 (Given)  决策主题涉及 "供应商成本对比"
并且 (And)    存在 depends_on Bond 指向 "小李的成本对比报告"（未完成）
当   (When)   系统分析信息缺口
那么 (Then)   橙色区域应显示 "缺少: 小李的成本对比报告"
并且 (And)    AI 可推理出其他潜在缺失信息
```

### 场景 5: 用户思维模式（紫色区域）
```
假设 (Given)  用户历史上多次在面对成本问题时选择 "换" 而非 "优化"
当   (When)   AI 分析用户思维模式
那么 (Then)   紫色区域显示 "你倾向于遇到成本问题时选择替换而非优化"
并且 (And)    附带 2-3 个历史案例引用
并且 (And)    以确认形式呈现 "这准确吗？[是/否]"
```

### 场景 6: 进入 AI 对话
```
假设 (Given)  决策工坊已展示四维度证据
当   (When)   用户点击 💬 "继续讨论"
那么 (Then)   打开 AI 顾问对话窗口
并且 (And)    对话上下文自动包含决策主题和四维度摘要
并且 (And)    AI 以路路人格回应（温暖、不催促）
并且 (And)    对话内容保存为特殊类型的 record
```

### 场景 7: 单方面认知（无矛盾）
```
假设 (Given)  用户对某主题只有支持方观点，没有反对方
当   (When)   决策工坊展示
那么 (Then)   红色区域显示 "暂无反对观点"
并且 (And)    橙色区域可能提示 "是否考虑过风险因素？"
```

## 边界条件
- [x] 无反对方（场景 7）
- [ ] 大量证据（单侧 >20 条）：分页或折叠，显示 top 5 + "查看更多"
- [ ] Strike 被 superseded：应显示最新版本，标注 "已更新"
- [ ] 决策已做出后再次访问：保留历史快照，但标注决策结果

## 接口约定

输入：
```typescript
interface DecisionWorkshopInput {
  user_id: string
  topic: string              // 决策主题（自动或手动）
  contradictionBondId?: string  // 从矛盾 Bond 进入时
  strikeIds?: string[]       // 手动选择相关 Strike
}
```

输出：
```typescript
interface DecisionWorkshopResult {
  topic: string
  support: EvidenceItem[]     // 绿色: 支持方
  opposition: EvidenceItem[]  // 红色: 反对方
  gaps: GapItem[]             // 橙色: 信息缺口
  pattern: PatternItem | null // 紫色: 用户思维模式
  chatContext: string         // 序列化的对话上下文
}

interface EvidenceItem {
  strikeId: string
  nucleus: string
  polarity: string
  date: string
  sourceRecordId: string     // 溯源
  bondType?: string          // 通过什么关系关联到此决策
}

interface GapItem {
  description: string
  relatedStrikeId?: string   // depends_on 来源
  isAiInferred: boolean      // AI 推理的 vs 明确的依赖
}

interface PatternItem {
  description: string        // "你倾向于..."
  examples: {
    strikeId: string
    nucleus: string
    date: string
  }[]
  confirmed?: boolean        // 用户是否确认
}
```

## 依赖
- strike / bond 表
- 矛盾检测模块（contradiction Bond 数据）
- 混合检索模块（收集相关证据）
- AI 服务（信息缺口分析 + 思维模式提取）
- AI 顾问对话模块

## 备注
- 入口：聚类详情页 "帮我想想" / 每日回顾洞察 / 手动选择 Strike
- 四色对应固定语义：绿=支持、红=反对、橙=缺失、紫=模式
- 思维模式以确认而非断言形式呈现，尊重用户自主权
- 对话保存为 record，source_type = "think"，后续参与 Digest
