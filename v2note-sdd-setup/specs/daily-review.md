# 每日回顾（Daily Review）

> 状态：🟡 待开发

## 概述
每日晨间和晚间自动生成回顾报告。晨间：今日行动 + 系统洞察（偏离/模式/共鸣）；晚间：统计 + 洞察 + 最有价值记录 + 情感轨迹 + 反思提示。**所有 AI 主动汇报集中在此，不散布在其他地方**，减少打扰、增加信任。

## 场景

### 场景 1: 晨间报告 — 今日行动
```
假设 (Given)  用户有 5 个待办行动
当   (When)   用户打开晨间回顾
那么 (Then)   显示今日优先行动列表（top 5）
并且 (And)    每项显示: 名称 + 紧急度标记 + 简要上下文
并且 (And)    排序与行动面板一致
```

### 场景 2: 晨间报告 — 系统洞察
```
假设 (Given)  昨日有新的矛盾检测结果
当   (When)   晨间回顾生成
那么 (Then)   洞察区域应显示 "发现认知冲突" 提示
并且 (And)    简要描述矛盾双方
并且 (And)    提供 "深入了解" 入口（跳转决策工坊）
```

### 场景 3: 晨间报告 — 接力追踪
```
假设 (Given)  用户昨天创建了 intend Strike "让小李做成本对比"
当   (When)   晨间回顾生成
那么 (Then)   接力区域应显示 "待确认: 小李的成本对比"
并且 (And)    显示已过天数
```

### 场景 4: 晚间回顾 — 统计摘要
```
假设 (Given)  用户今天输入了 8 条记录，完成了 3 个行动
当   (When)   晚间回顾生成
那么 (Then)   显示: 今日记录数、完成行动数、新增 Strike 数
并且 (And)    与昨日对比（↑/↓ 趋势）
```

### 场景 5: 晚间回顾 — 最有价值记录
```
假设 (Given)  今日有多条记录
当   (When)   系统评估价值
那么 (Then)   选出 salience 最高或触发最多 Bond 的记录
并且 (And)    显示为 "今日最有价值记录" 并引用原文
```

### 场景 6: 晚间回顾 — 情感轨迹
```
假设 (Given)  今日有 feel 类型 Strike
当   (When)   晚间回顾生成
那么 (Then)   显示情感时间线（时间 + feel 摘要）
并且 (And)    不做判断，只呈现轨迹
```

### 场景 7: 晚间回顾 — 反思提示
```
假设 (Given)  晚间回顾数据已汇总
当   (When)   生成反思提示
那么 (Then)   AI 应基于今日认知活动生成 1-2 个温和的反思问题
并且 (And)    问题应与具体 Strike 相关（非泛泛而谈）
并且 (And)    语气温暖、不带压迫感
```

### 场景 8: 无活动日
```
假设 (Given)  用户今天没有任何输入
当   (When)   晚间回顾生成
那么 (Then)   显示温暖的空状态（如 "安静的一天也是好的一天"）
并且 (And)    不显示统计面板
并且 (And)    可选显示一个历史 Strike 回顾（"还记得这个吗？"）
```

## 边界条件
- [x] 无活动日（场景 8）
- [ ] 用户关闭回顾功能：应尊重设置，不强制展示
- [ ] AI 生成反思问题失败：降级为预设模板问题
- [ ] 跨时区：按用户设置的时区判定 "今天"
- [ ] 首次使用（无历史数据）：显示引导式内容而非空白

## 接口约定

输入：
```typescript
interface DailyReviewInput {
  user_id: string
  type: 'morning' | 'evening'
  date?: string              // YYYY-MM-DD，默认今天
  timezone?: string          // 默认 'Asia/Shanghai'
}
```

输出：
```typescript
interface MorningReview {
  actions: ActionItem[]       // 今日待办（top 5）
  insights: Insight[]         // 系统洞察（矛盾/模式/共鸣）
  relays: RelayItem[]         // 接力追踪
}

interface EveningReview {
  stats: DayStats
  mostValuableRecord?: {
    recordId: string
    content: string
    reason: string           // 为什么有价值
  }
  emotionTrack: EmotionPoint[]
  reflectionPrompts: string[] // 1-2 个反思问题
}

interface DayStats {
  recordCount: number
  actionsCompleted: number
  strikesCreated: number
  bondsCreated: number
  trend: 'up' | 'down' | 'stable'  // 与昨日对比
}

interface Insight {
  type: 'contradiction' | 'pattern' | 'resonance' | 'deviation'
  title: string
  description: string
  relatedStrikeIds: string[]
  actionUrl?: string         // 跳转链接（如决策工坊）
}

interface RelayItem {
  strikeId: string
  title: string              // "让小李做成本对比"
  person: string             // "小李"
  daysSince: number
}

interface EmotionPoint {
  time: string               // HH:mm
  nucleus: string            // feel Strike 摘要
}
```

## 依赖
- strike / bond / record 表
- 行动面板模块（ActionPanel）
- 矛盾检测模块（Contradiction Detection）
- AI 服务（反思问题生成）
- daily-loop.ts 调度器

## 备注
- 核心原则：**AI 所有主动汇报集中在 Daily Review**，不在其他地方打扰用户
- 晨间偏行动导向，晚间偏反思导向
- 反思问题的语气参考路路（鹿鹿）人格：温暖、不催促、不评判
- 情感轨迹只呈现不分析，尊重用户的感受自主权
