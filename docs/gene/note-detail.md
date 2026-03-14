## gene_note_detail (已废弃)
### 状态
**已废弃** — v2026.03.13c 取消独立详情页，原文+待办功能内联到 TimelineCard 展开态（见 gene_timeline_card）。

### 原功能描述
笔记详情与编辑页面。展示录音转写、摘要、标签、待办等完整信息。支持单条删除。

### 废弃原因
短内容（一句话）时详情页元数据占大量空间，比例不协调。改为卡片内展开显示，减少页面跳转。

### 关键文件（仍存在但不再从主页引用）
- `features/notes/components/note-detail.tsx` — 组件仍存在，但 page.tsx 不再 import
- `features/notes/hooks/use-note-detail.ts` — 被 TimelineCard 复用于展开加载
