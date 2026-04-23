---
id: "063"
title: "批注系统"
status: deprecated
domain: ui
risk: medium
dependencies: []
superseded_by: null
created: 2026-03-23
updated: 2026-03-30
---
# 批注系统

> 状态：🔴 未实现（后端工具函数在，前端UI组件从未创建）| 优先级：Phase 5
> ⚠️ features/reader/components/ 为空，text-toolbar/annotation-sidebar 不存在
> 依赖：reader

## 概述
阅读器中的高亮和批注能力。高亮产出特殊 Strike（参与 Bond 和 Cluster），批注产出新的 think 日记（自动关联到被批注内容）。

## 场景

### 场景 1: 高亮标注
```
假设 (Given)  用户在阅读器中选中文字并点击"高亮"
当   (When)   高亮创建
那么 (Then)   该段文字黄色底色显示
并且 (And)    创建特殊 Strike (polarity='perceive', source_type='highlight')
并且 (And)    该 Strike 参与后续 Bond 和 Cluster 计算
并且 (And)    高亮持久化，再次打开阅读器时可见
```

### 场景 2: 批注
```
假设 (Given)  用户在阅读器中选中文字并点击"批注"
当   (When)   用户输入批注文字并提交
那么 (Then)   批注以侧边气泡显示（紧贴被批注段落）
并且 (And)    批注保存为新 record (source_type='think')
并且 (And)    自动和被批注的日记建立 Bond（bond.type='annotation'）
并且 (And)    批注进入 Digest 管道，产出 Strike
```

### 场景 3: 素材上添加想法
```
假设 (Given)  用户阅读 PDF 素材
并且 (And)    选中一段后点击"添加想法"
当   (When)   输入想法文字并提交
那么 (Then)   创建 think 日记，关联到素材 record
并且 (And)    想法的 Strike 和素材的 Strike 建立 Bond
并且 (And)    想法参与涌现（think 权重），素材不参与（material 降权）
```

### 场景 4: 高亮和批注管理
```
假设 (Given)  用户想查看所有高亮和批注
当   (When)   在阅读器侧栏切换到"标注"视图
那么 (Then)   按时间倒序列出所有高亮和批注
并且 (And)    点击可跳转到原文位置
并且 (And)    长按可删除（软删除，Strike status→archived）
```

## 涉及文件
| 文件 | 改动类型 |
|------|---------|
| `features/reader/components/text-toolbar.tsx` | 修改：高亮/批注按钮逻辑 |
| 新建 `features/reader/components/annotation-sidebar.tsx` | 批注侧栏 |
| `gateway/src/routes/` | 新增：高亮/批注 CRUD API |
| migration | highlight 存储（复用 strike 表 + source_type='highlight'） |

## AI 调用
0 次（批注进入标准 Digest 管道）

## 验收标准
高亮和批注持久化，批注直接产生 think 日记参与认知引擎。
