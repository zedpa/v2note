# 语音转结构化待办 (Voice to Structured Todo)

> 状态：🟡 待开发

## 概述
用户通过语音输入一段自然语言描述，系统自动解析出待办事项的标题、时间、关联人、优先级等结构化信息，并创建对应的 Todo 记录。

## 场景

### 场景 1: 基本语音转待办（含明确时间和人物）
```
假设 (Given)  系统已初始化，当前时间为 2026-03-23 10:00
当   (When)   用户输入文本 "明天下午三点和张总开会讨论Q3预算"
那么 (Then)   系统应生成一条待办事项
并且 (And)    标题包含 "开会讨论Q3预算"
并且 (And)    日期为 2026-03-24
并且 (And)    时间为 15:00
并且 (And)    关联人列表包含 "张总"
并且 (And)    返回结果的 success 字段为 true
```

### 场景 2: 模糊时间表述
```
假设 (Given)  系统已初始化
当   (When)   用户输入文本 "下周找个时间 review 一下代码"
那么 (Then)   系统应生成一条待办事项
并且 (And)    标题包含 "review" 或 "代码"
并且 (And)    时间标记为 "pending"（待定）
并且 (And)    不应抛出错误
```

### 场景 3: 多个待办事项在同一段文本中
```
假设 (Given)  系统已初始化
当   (When)   用户输入文本 "明天上午给李明发邮件，下午两点开产品评审会"
那么 (Then)   系统应生成两条待办事项
并且 (And)    第一条包含 "发邮件" 和关联人 "李明"
并且 (And)    第二条包含 "产品评审会" 和时间 14:00
```

### 场景 4: 空白或无意义输入
```
假设 (Given)  系统已初始化
当   (When)   用户输入空字符串 ""
那么 (Then)   系统不应生成任何待办
并且 (And)    返回结果的 success 字段为 true
并且 (And)    返回结果的 todos 数组长度为 0
并且 (And)    返回结果包含友好提示信息
```

### 场景 5: 带优先级关键词
```
假设 (Given)  系统已初始化
当   (When)   用户输入文本 "紧急！今天必须完成报价单"
那么 (Then)   系统应生成一条待办事项
并且 (And)    优先级为 "high"
并且 (And)    日期为今天
```

### 场景 6: 纯闲聊无任务内容
```
假设 (Given)  系统已初始化
当   (When)   用户输入文本 "今天天气真不错"
那么 (Then)   系统不应生成待办事项
并且 (And)    返回结果的 todos 数组长度为 0
并且 (And)    返回结果包含提示 "未检测到待办事项"
```

## 边界条件
- [x] 空输入（场景 4）
- [x] 无任务意图的输入（场景 6）
- [ ] 超长输入（>2000 字符）：应截断处理，不崩溃
- [ ] 包含特殊字符（emoji、标点符号混合）：正常解析
- [ ] 英文混合中文输入："周五 meeting with John 讨论 API design"

## 接口约定

输入：
```typescript
interface ParseVoiceInput {
  text: string           // 语音转文字后的文本
  timestamp?: Date       // 输入时间（用于解析相对时间）
  timezone?: string      // 时区，默认 'Asia/Shanghai'
}
```

输出：
```typescript
interface ParseVoiceResult {
  success: boolean
  todos: ParsedTodo[]
  message?: string       // 提示信息（空输入、无任务时）
}

interface ParsedTodo {
  title: string
  date?: string          // ISO 格式 YYYY-MM-DD，无法解析时为 undefined
  time?: string          // HH:mm 格式，无法解析时为 undefined
  timePending?: boolean  // 时间待定
  priority: 'high' | 'medium' | 'low'
  people: string[]       // 关联人列表
  rawText: string        // 原始对应文本片段
}
```

## 依赖
- AI 文本解析服务（可以是 Claude API 或本地规则引擎）
- 日期时间处理库（dayjs）

## 备注
- Phase 1 先用规则引擎 + 关键词匹配实现，不依赖外部 AI API
- Phase 2 再接入 Claude API 做深度语义解析
- 时间解析需要考虑中文特有的表述："后天"、"大后天"、"下下周"
