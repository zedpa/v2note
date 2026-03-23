# 混合检索（Hybrid Retrieval）

> 状态：🟡 待开发

## 概述
为新提取的 Strike 在历史 Strike 库中寻找相关联的认知触动。采用 5 通道混合检索策略（语义 + 结构化），为跨记录 Bond 建立提供候选集。这是连接用户过去与当下认知的关键桥梁。

## 场景

### 场景 1: 语义相似检索（Channel A）
```
假设 (Given)  数据库中存在 Strike "铝价涨了15%"（embedding 已生成）
当   (When)   新 Strike "原材料成本上升" 进入检索
那么 (Then)   Channel A 应通过向量相似度检索
并且 (And)    "铝价涨了15%" 出现在 top-5 结果中
并且 (And)    返回相似度分数 >= 0.7
```

### 场景 2: 同标签检索（Channel B1）
```
假设 (Given)  数据库中存在 Strike 带标签 "供应链"
当   (When)   新 Strike 也带标签 "供应链"
那么 (Then)   Channel B1 应命中该历史 Strike
并且 (And)    结果中包含匹配的标签信息
```

### 场景 3: 同人物检索（Channel B2）
```
假设 (Given)  数据库中存在 Strike 关联人物 "张总"
当   (When)   新 Strike 也关联人物 "张总"
那么 (Then)   Channel B2 应命中该历史 Strike
并且 (And)    支持中文人名的模糊匹配（"张总" ≈ "张伟总"）
```

### 场景 4: 时间窗口检索（Channel B3）
```
假设 (Given)  数据库中存在 7 天内的 Strike
当   (When)   新 Strike 进入检索，时间窗口为 ±7 天
那么 (Then)   Channel B3 应返回该时间范围内的 Strike
并且 (And)    不应返回超出时间窗口的 Strike
```

### 场景 5: 反向极性检索（Channel B4，矛盾检测专用）
```
假设 (Given)  数据库中存在 judge Strike "应该换供应商"
当   (When)   新 Strike "不应该换供应商"（judge 极性）进入检索
那么 (Then)   Channel B4 应通过反向极性匹配命中
并且 (And)    标记为矛盾候选
```

### 场景 6: 多通道融合与去重
```
假设 (Given)  同一个历史 Strike 同时被 Channel A 和 B1 命中
当   (When)   系统合并多通道结果
那么 (Then)   该 Strike 不应重复出现
并且 (And)    最终得分 = 语义相似度 × 0.6 + 结构化命中数 × 0.4
并且 (And)    结果按综合得分降序排列
```

### 场景 7: 无匹配结果
```
假设 (Given)  数据库为空或没有相关 Strike
当   (When)   新 Strike 进入检索
那么 (Then)   系统应返回空候选集
并且 (And)    不应抛出错误
并且 (And)    后续流程正常继续（只是没有跨记录 Bond）
```

## 边界条件
- [x] 数据库为空（场景 7）
- [ ] 大量 Strike（>10000 条）：检索延迟应 < 2 秒
- [ ] embedding 维度不匹配：应优雅报错
- [ ] 部分 Channel 失败：其余 Channel 继续工作，降级返回
- [ ] 同一 Strike 不应与自己匹配

## 接口约定

输入：
```typescript
interface RetrievalInput {
  strike: {
    nucleus: string
    polarity: string
    embedding: number[]    // 1024 维向量
    people: string[]
    tags: string[]
    timestamp: string
  }
  options?: {
    topK?: number          // 默认 10
    timeWindow?: number    // 天数，默认 7
    excludeIds?: string[]  // 排除的 Strike ID
  }
}
```

输出：
```typescript
interface RetrievalResult {
  candidates: RetrievalCandidate[]
  channelStats: {
    semantic: number       // Channel A 命中数
    tag: number            // B1
    people: number         // B2
    timeWindow: number     // B3
    reversedPolarity: number // B4
  }
}

interface RetrievalCandidate {
  strikeId: string
  nucleus: string
  polarity: string
  score: number            // 综合得分 0-1
  matchedChannels: string[] // 命中的通道列表
}
```

## 依赖
- 向量数据库（Supabase pgvector）
- strike / strike_tag 表
- embedding 服务

## 备注
- 综合得分公式：score = similarity × 0.6 + structuredHits × 0.4
- Channel B4（反向极性）专为矛盾检测设计，仅对 judge/perceive 极性生效
- Phase 2+ 增加 Channel C（聚类级别检索）
- Bond strength 未在此模块计算，由 AI 在后续 Bond 判定步骤中确定
