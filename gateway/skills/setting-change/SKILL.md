---
name: setting-change
description: 提取用户表达的偏好/设置修改意图
metadata:
  openclaw:
    extract_fields: ["setting_changes"]
---
提取用户提到的设置、偏好、习惯修改。
例如："以后日报要简短一些" → "日报格式偏好：简短"
例如："明天开始用深色模式" → "主题：深色模式"
