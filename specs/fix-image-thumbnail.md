---
id: fix-image-thumbnail
title: "Fix: 图片插入后显示文字描述而非缩略图"
status: completed
backport: app-mobile-views.md#场景 3.7a
domain: ui
risk: low
dependencies: ["attachment-persistence.md"]
created: 2026-04-11
updated: 2026-04-11
---

# Fix: 图片插入后显示文字描述而非缩略图

## Bug 现象
用户通过拍照/相册/文件选择器插入图片后，时间线卡片优先显示 Vision AI 的文字描述（如 `[图片内容无法识别]`），而非图片缩略图。用户期望看到图片的可视化预览。

## 根因分析

### 根因 1: `source` 字段不匹配
`gateway/src/routes/ingest.ts:128` 创建图片 record 时 `source: "manual"`，而非 `"image"`。前端 `isImage` 检测的第一条件 `note.source === "image"` 永远不命中，只能依赖 `file_url` 模式匹配作为 fallback。

### 根因 2: 图片卡片布局不合理
`notes-timeline.tsx` 中，图片卡片的文字摘要（`short_summary`）渲染在缩略图之前（行 700-712 文字 vs 行 734-763 缩略图）。当 Vision AI 失败时，`short_summary` = `"[图片内容无法识别]"`，用户看到的是一段无意义文字，缩略图排在下方不够醒目。

### 根因 3: Vision AI 失败时无降级体验
Vision AI 失败（`visionResult.success === false`）时，`title` 设为 `"[图片分析失败]"`，`short_summary` 设为 `"[图片内容无法识别]"`。卡片显示这两段无用文字，没有任何视觉化降级。

## 修复方案

### 1. 后端：设置正确的 source 字段
- `ingest.ts`: 图片类型 record 的 `source` 改为 `"image"`
- 确保 `HIDDEN_SOURCES_CLAUSE` 不过滤 `"image"`（已确认不过滤）

### 2. 后端：Vision AI 失败的降级
- `title` 改为 `"图片"`（而非 `"[图片分析失败]"`）
- `short_summary` 改为空字符串（而非 `"[图片内容无法识别]"`）
- 具体代码变更：`summaryRepo.create` 中 `short_summary: visionResult.success ? visionResult.text : ""`

### 3. 前端：图片卡片布局优化
- 图片类型卡片中，**缩略图置于文字摘要之前**（交换 DOM 顺序）
- 当 `isImage && !note.short_summary` 时，不渲染文字摘要区域（只显示缩略图）
- Vision AI 成功时，文字摘要保留在缩略图下方（作为图片描述）
- **不使用方括号检测**——完全依赖后端设空字符串来控制显示逻辑

### 4. 前端：图片加载失败降级
- `<img>` 标签增加 `onError` handler：隐藏图片，显示一个文件图标 placeholder
- 确保加载失败时卡片不会完全空白

### 5. 历史数据兼容
- 前端 `isImage` 中的 `file_url` 模式匹配 fallback **必须保留**
- 已有 `source: "manual"` 的历史图片 record 仍通过 `file_url` 模式匹配检测为图片
- 不需要数据迁移

## 场景

### 场景 1: 图片插入成功 + Vision AI 成功
```
假设 (Given)  后端 Vision AI 已成功识别图片内容
当   (When)   用户上传一张图片并打开时间线
那么 (Then)   时间线卡片先显示图片缩略图（max-h-40）
并且 (And)    缩略图下方显示识别出的文字描述
并且 (And)    卡片顶部 meta 行显示图片图标与"图片"标签
```

### 场景 2: 图片插入成功 + Vision AI 失败
```
假设 (Given)  后端 Vision AI 分析该图片失败
当   (When)   用户上传一张图片并打开时间线
那么 (Then)   时间线卡片显示图片缩略图（max-h-40）
并且 (And)    卡片不显示 "[图片内容无法识别]" 等 fallback 文字
并且 (And)    卡片标题为 "图片"
并且 (And)    缩略图下方无文字摘要
```

### 场景 3: isImage 检测覆盖所有 file_url 格式
```
假设 (Given)  图片 record 的 file_url 为以下任一格式：
              - OSS URL: https://xxx.oss-cn-xxx.aliyuncs.com/images/xxx.jpg
              - OSS URL 带参数: https://xxx/images/xxx.jpg?token=abc
              - Data URL: data:image/jpeg;base64,...
              - Data URL (png): data:image/png;base64,...
当   (When)   时间线渲染该 record
那么 (Then)   isImage 检测为 true
并且 (And)    显示图片缩略图
```

### 场景 4: 点击缩略图查看大图
```
假设 (Given)  时间线卡片显示图片缩略图
当   (When)   用户点击缩略图
那么 (Then)   全屏图片查看器打开
并且 (And)    显示完整尺寸的图片
```

### 场景 5: 历史 source=manual 的图片 record 兼容
```
假设 (Given)  数据库中已有 source="manual", file_url="data:image/jpeg;base64,..." 的图片 record
当   (When)   时间线渲染该 record
那么 (Then)   isImage 通过 file_url 模式匹配检测为 true
并且 (And)    显示图片缩略图
```

### 场景 6: 图片加载失败
```
假设 (Given)  图片 record 的 file_url 指向一个无法访问的 URL（OSS 过期等）
当   (When)   时间线渲染该 record，img 标签触发 onError
那么 (Then)   隐藏 img 标签
并且 (And)    显示一个文件图标 placeholder
并且 (And)    卡片不会完全空白
```

## 验收行为（E2E 锚点）

> 图片上传依赖后端服务，E2E 层面只验证前端渲染逻辑。

### 行为 1: 图片卡片渲染缩略图
1. 渲染一个包含 `file_url`（data URL 格式）和 `source: "image"` 的 NoteItem
2. 卡片应显示 `<img>` 缩略图（`data-testid="image-thumbnail"`）
3. 缩略图应在文字摘要之前渲染（DOM 顺序）

### 行为 2: Vision AI 失败时只显示缩略图
1. 渲染一个 `short_summary` 为空、`title` 为 "图片" 的图片 NoteItem（带 file_url）
2. 卡片应显示缩略图
3. 卡片不应显示 "[图片内容无法识别]" 或 "[图片分析失败]" 文字

### 行为 3: 历史数据兼容
1. 渲染一个 `source: "manual"`、`file_url` 为 data URL 的 NoteItem
2. 卡片应正确检测为图片类型并显示缩略图

## 边界条件
- [x] file_url 为 null → isImage = false，不显示缩略图（正常行为）
- [x] 图片加载失败 → onError 隐藏 img，显示 placeholder 图标
- [x] Vision AI 超时（30s）→ 使用降级方案（title="图片", short_summary=""）
- [x] 超大 data URL（>10MB base64）→ 缩略图可能渲染缓慢，但不应崩溃
- [x] short_summary 为空时，下游认知引擎通过 transcript.text 和 title 获取信息，不受影响

## 影响文件
- `gateway/src/routes/ingest.ts` — source 字段 + summary 降级
- `features/notes/components/notes-timeline.tsx` — 图片卡片布局 + onError 处理

## 回归测试标注
测试用例 describe 块标注 `regression: fix-image-thumbnail`
