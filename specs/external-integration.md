---
id: "080"
title: "外部数据源集成"
status: draft
domain: infra
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 外部数据源集成

> 状态：🟡 设计阶段 | 优先级：Phase 6+ | 预计：待评估
> 说明: 概念级 spec，需细化具体场景后再实施。当前 Ingest API 已支持 text/image/file/url 四种类型输入。

## 概述
日历事件、邮件摘要、浏览器剪藏等外部数据自动流入为 material 类型，丰富认知上下文但不污染涌现结构。

## 场景

### 场景 1: 日历事件自动导入
```
假设 (Given)  用户授权 Google Calendar / Apple Calendar
当   (When)   有新日程事件
那么 (Then)   创建 record (source_type='material', type='calendar')
并且 (And)    提取时间、参与人、标题
并且 (And)    进入 Digest 管道（material 降权）
```

### 场景 2: 浏览器剪藏
```
假设 (Given)  用户安装浏览器插件
当   (When)   点击"保存到念念有路"
那么 (Then)   Readability 提取正文
并且 (And)    创建 material record
并且 (And)    Digest 产出 Strike（低 salience）
```

### 场景 3: 微信/飞书消息转发
```
假设 (Given)  用户分享消息到念念有路小程序
当   (When)   接收消息内容
那么 (Then)   创建 material record
并且 (And)    提取关联人名
```

## 涉及文件
待评估

## 验收标准
外部数据作为 material 流入后，不影响 Cluster 涌现结构，但能在参谋对话中被引用。
