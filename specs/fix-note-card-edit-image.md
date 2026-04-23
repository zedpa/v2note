---
id: fix-note-card-edit-image
title: "Fix: 日记卡片编辑窗口自适应 + 图片缩略图检测"
status: completed
backport: app-mobile-views.md#场景 3.3c
domain: ui
risk: low
created: 2026-04-10
updated: 2026-04-10
---

# Fix: 日记卡片编辑窗口自适应 + 图片缩略图检测

## Bug 1: 就地编辑窗口太小

### 现象
日记卡片点击"编辑"后，textarea 只有 ~80px 高度（2-3 行），无论原文多长都不变。

### 根因
`notes-timeline.tsx:660` textarea 使用固定 `min-h-[80px]` + `resize-none`，无 auto-resize 逻辑。

### 修复方案
- 初始高度自适应内容（`scrollHeight`）
- 限制最大高度 `max-h-[50vh]`，超出后 `overflow-y: auto`
- 使用 `useEffect` + `onChange` 双触发自动调整高度

### 场景

- Given 一条日记有 10 行文字
- When 用户点击编辑
- Then textarea 高度自适应显示全部 10 行（最大 50vh）

- Given 一条日记有 1 行文字
- When 用户点击编辑
- Then textarea 至少 80px，不会压缩过小

## Bug 2: 插入图片无缩略图

### 现象
通过粘贴或拍照插入的图片，卡片中不显示缩略图预览。

### 根因
`notes-timeline.tsx:535` 的 `isImage` 检测不完善：
```javascript
const isImage = note.source === "image" || (note.file_url && /\.(jpg|...)$/i.test(note.file_url));
```

1. ingest 路由设置 `source: "manual"` 而非 `"image"` → 第一个条件不命中
2. 无 OSS 时 file_url 为 `data:image/jpeg;base64,...` → 正则不匹配
3. OSS URL 带 query params `?token=xxx` → 正则 `$` 匹配失败

### 修复方案
增强 `isImage` 检测，覆盖三种 URL 格式：
1. `source === "image"` — 保留（未来可能用到）
2. `file_url` 匹配图片扩展名（去 query params 后匹配）
3. `file_url` 以 `data:image/` 开头（data URL）

## 影响文件
- `features/notes/components/notes-timeline.tsx`
