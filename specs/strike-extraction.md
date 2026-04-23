---
id: "098"
title: "Strike 提取（Strike Extraction）"
status: active
domain: cognitive
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-23
---
# Strike 提取（Strike Extraction）

> 状态：✅ 已完成（Phase 1 规则引擎）

## 概述
将用户输入的自然语言文本（语音转写、手动输入等）分解为一个或多个 Strike（认知触动），每个 Strike 包含语义核心（nucleus）、认知极性（polarity）、上下文场（field）和置信度。这是认知引擎的基础能力，所有上层功能（聚类、矛盾检测、目标涌现）都依赖于准确的 Strike 提取。

## 场景

### 场景 1: 单条事实陈述 → 单个 perceive Strike
```
假设 (Given)  用户已登录，系统正常运行
当   (When)   用户输入文本 "张总说铝价涨了15%"
那么 (Then)   系统应提取出 1 个 Strike
并且 (And)    nucleus 包含 "铝价涨了15%"
并且 (And)    polarity 为 "perceive"
并且 (And)    confidence >= 0.7
并且 (And)    people 列表包含 "张总"
```

### 场景 2: 判断性观点 → judge Strike
```
假设 (Given)  用户已登录
当   (When)   用户输入文本 "我觉得我们应该换供应商"
那么 (Then)   系统应提取出 1 个 Strike
并且 (And)    polarity 为 "judge"
并且 (And)    nucleus 包含 "换供应商"
```

### 场景 3: 顿悟认知 → realize Strike（高权重）
```
假设 (Given)  用户已登录
当   (When)   用户输入文本 "突然想明白了，根本原因不是材料成本，是流程效率"
那么 (Then)   系统应提取出 1 个 Strike
并且 (And)    polarity 为 "realize"
并且 (And)    nucleus 包含 "流程效率" 相关语义
并且 (And)    confidence >= 0.8（realize 类型天然高置信）
```

### 场景 4: 意图行动 → intend Strike
```
假设 (Given)  用户已登录
当   (When)   用户输入文本 "必须在Q2之前把吨成本降到X以下"
那么 (Then)   系统应提取出 1 个 Strike
并且 (And)    polarity 为 "intend"
并且 (And)    nucleus 包含目标描述
```

### 场景 5: 情感表达 → feel Strike（排除在逻辑链外）
```
假设 (Given)  用户已登录
当   (When)   用户输入文本 "这件事让我很不安"
那么 (Then)   系统应提取出 1 个 Strike
并且 (And)    polarity 为 "feel"
并且 (And)    该 Strike 不应参与因果链推理
```

### 场景 6: 复杂段落 → 多个不同极性的 Strike
```
假设 (Given)  用户已登录
当   (When)   用户输入文本 "今天和张总开会，他说铝价涨了15%，我觉得应该换供应商，但老王反对说风险太大，让小李去做成本对比"
那么 (Then)   系统应提取出至少 4 个 Strike
并且 (And)    包含 polarity 为 "perceive" 的 Strike（铝价事实）
并且 (And)    包含 polarity 为 "judge" 的 Strike（换供应商观点 + 老王反对）
并且 (And)    包含 polarity 为 "intend" 的 Strike（让小李做对比）
并且 (And)    同一段文本内的 Strike 之间应建立 Bond
```

### 场景 7: 同段内 Bond 生成
```
假设 (Given)  用户输入的段落产生了多个 Strike
当   (When)   系统完成 Strike 提取
那么 (Then)   应自动识别同段落内 Strike 之间的关系
并且 (And)    "铝价涨了" → "应该换供应商" 标记为 causal Bond
并且 (And)    "应该换供应商" ↔ "风险太大" 标记为 contradiction Bond
并且 (And)    Bond 的 strength 在 0.5-1.0 之间
```

### 场景 8: material 类型输入降权处理
```
假设 (Given)  用户粘贴了一篇外部文章，source_type 为 "material"
当   (When)   系统提取 Strike
那么 (Then)   所有 Strike 的 salience 应为正常值的 1/5 ~ 1/10
并且 (And)    这些 Strike 不应参与后续聚类涌现
并且 (And)    只能被动吸附到已有聚类中
```

### 场景 9: 空输入或无意义输入
```
假设 (Given)  用户已登录
当   (When)   用户输入空字符串 "" 或纯标点 "。。。"
那么 (Then)   系统应返回空 Strike 列表
并且 (And)    不应抛出错误
并且 (And)    应标记 record.digested = true（避免重复处理）
```

## 边界条件
- [x] 空输入（场景 9）
- [x] material 降权（场景 8）
- [ ] 超长输入（>5000 字）：应分段处理，每段独立提取
- [ ] 非中文输入（纯英文、日文等）：应能正确识别极性
- [ ] AI 服务超时：应优雅降级，保留原文，标记 digested = false
- [ ] 极性判定模糊：confidence 应低于阈值，等待用户修正

## 接口约定

输入：
```typescript
interface DigestInput {
  record_id: string        // 原始记录 ID
  text: string             // 待提取文本
  source_type: 'think' | 'material'  // 输入类型
  timestamp?: Date         // 输入时间
  user_id: string
}
```

输出：
```typescript
interface DigestResult {
  success: boolean
  strikes: ExtractedStrike[]
  bonds: ExtractedBond[]
  message?: string
}

interface ExtractedStrike {
  nucleus: string           // 语义核心
  polarity: 'perceive' | 'judge' | 'realize' | 'intend' | 'feel'
  confidence: number        // 0-1
  salience: number          // 0-1，material 类型降权
  people: string[]          // 关联人
  field: {
    timestamp: string
    life_phase?: string
    space?: string
    energy?: string
    mood?: string
    social_context?: string
  }
  rawText: string           // 对应原文片段
}

interface ExtractedBond {
  source_index: number      // strikes 数组中的索引
  target_index: number
  type: 'causal' | 'contradiction' | 'resonance' | 'evolution' | 'depends_on' | 'perspective_of' | 'abstracted_from'
  strength: number          // 0-1
}
```

## 依赖
- AI 文本解析服务（DashScope / Claude API）
- 向量嵌入服务（生成 Strike embedding）
- 数据库：strike / bond / strike_tag 表
- 中文分词 / 人名识别

## 备注
- Phase 1 实现：2 次 LLM 调用（提取 + Bond 判定）
- realize 类型 Strike 天然高权重，影响后续聚类和目标涌现
- feel 类型排除在逻辑链（因果/矛盾）之外，但保留在情感轨迹中
- 用户可在前端修正 nucleus 和 polarity，修正后 created_by = "user"（更高权重）
