# Audit: app/timeline/page.tsx — Scene B Timeline

Read docs/PLAN-pc-design.md sections "五、场景B：时间线" for full requirements.

## Three-column layout
- [ ] Left 200px + Center flex-1 + Right 320px (right hidden by default)
- [ ] All columns bg-cream, left/right bg-sand
- [ ] Left has border-r border-brand-border, right has border-l

## Left column: Structure Navigation (200px) (Section 5.2)
- [ ] Load topics from GET /api/v1/cognitive/clusters
- [ ] Display as tree: topic name with indent for sub-topics
- [ ] Each topic shows diary count badge
- [ ] Click topic → filter center column to that topic's diaries only
- [ ] "全部" button at top to show all
- [ ] Selected topic: bg-cream, font-bold
- [ ] Unselected: normal weight
- [ ] "+ 新主题" button at bottom (console.log for now)
- [ ] New/emerging topics show a subtle "新" dot (deer colored, 6px)
- [ ] Max 3 levels of nesting
- [ ] Right-click topic → context menu: rename, merge, delete (console.log)

## Center column: Diary Flow (Section 5.3)
- [ ] Top filter bar: 全部 | 语音 | 文字 | 图片 | 带文件 (tab buttons)
- [ ] Date range filter (optional, can be simple date inputs)
- [ ] Each diary card (Twitter/X style):
  - [ ] Top row: Avatar circle (first char of username) + username "Zed" + timestamp "09:12" + input type icon (🎙语音/✏️文字/📷图片/📎文件)
  - [ ] Body: original text (NOT AI processed), max 4 lines with line-clamp, click to expand
  - [ ] Media: if has image show thumbnail, if has file show file block
  - [ ] Bottom row: topic tags (pill shaped, bg-sand, text-[#6B5E52]) + 💬 comment count + 🔗 relation count
  - [ ] Card style: bg-white, rounded-lg (8px), border border-brand-border, p-4, mb-3
  - [ ] Hover: subtle shadow
- [ ] NO AI observation cards in the diary flow (report not scattered principle)
- [ ] Load from GET /api/v1/records API

## Right column: Focus Sidebar (320px) (Section 5.4)
- [ ] Hidden by default
- [ ] Click a diary card → right column appears with slide-in animation
- [ ] Close button (✕) at top right
- [ ] Content sections:
  1. 📝 原始记录: full original text + if voice, show 🎙 playback button (placeholder)
  2. 📎 附件: list of files/images (if any)
  3. 🔗 相关记录: list of related records with relevance percentage bar (bg-sky/20 fill)
  4. 📂 所属: topic name (clickable → jumps to that topic in left column) + goal name if exists
  5. 💬 "和路路聊聊这条记录" button at bottom (deer color, rounded)

## Brand compliance
- [ ] Colors: bark, deer, antler, cream, sand, brand-border only
- [ ] Font: Noto Sans SC for UI text
- [ ] No purple, no cold gray
- [ ] Animations max 200ms ease-out

After fixing, run: npx tsc --noEmit
