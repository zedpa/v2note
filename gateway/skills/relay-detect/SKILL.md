---
name: relay-detect
description: 识别信息转达任务——谁让谁告诉谁什么
type: process
metadata:
  openclaw:
    extract_fields: ["relays"]
    always: true
---

# 信息转达识别

从用户的语音或文字记录中识别信息转达任务。

## 识别模式

| 模式 | 方向 | 示例 |
|------|------|------|
| 告诉/转达/让XXX知道 | outgoing | "告诉张总明天开会改到3点" |
| 帮我问/跟XXX确认 | outgoing | "帮我问小王进度怎么样" |
| XXX让我/XXX要求 | incoming | "张总让我把报告发给财务" |
| XXX托我转告 | incoming→outgoing | "王总托我转告李经理下周出差" |
| 回复/答复XXX | outgoing | "回复客户说方案已确认" |

## 输出格式

每条转达任务应包含：
- `text`: 转达任务的简洁描述（动词开头）
- `source_person`: 信息来源人
- `target_person`: 信息接收人
- `context`: 转达的核心内容
- `direction`: "outgoing"（需要去告诉别人）或 "incoming"（别人让我做）

放入 JSON 响应的 `relays` 数组中。

## 示例

| 原文 | 提取结果 |
|------|----------|
| "告诉张总明天开会改到3点" | `{"text":"告诉张总明天开会改到3点","source_person":"我","target_person":"张总","context":"明天开会改到3点","direction":"outgoing"}` |
| "张总让我把报告发给财务" | `{"text":"把报告发给财务","source_person":"张总","target_person":"财务","context":"发报告","direction":"incoming"}` |
| "帮我问小王进度怎么样" | `{"text":"问小王项目进度","source_person":"我","target_person":"小王","context":"确认进度","direction":"outgoing"}` |
