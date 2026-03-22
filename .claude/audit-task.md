# PC Frontend Audit Task

Read `docs/PLAN-pc-design.md` for the full design spec. Then audit the following files against the spec requirements. For each file, check if all described features are implemented. Fix anything missing.

## Files to audit:

### 1. app/write/page.tsx (Scene A: Writing)
Required features per spec:
- Centered editor max-w-[680px], bg-cream
- Date title auto-generated (X月X日 周X), font-serif
- Monospace font, line-height 2x
- Ctrl+Enter submit -> POST /api/v1/ingest -> clear -> "✓ 路路收到了" feedback 1.5s
- Ctrl+S save draft (auto-save every 30s)
- Bottom status bar (hover visible): "Markdown" label + line/word count + submit button
- Drag-drop zone: files/images/links with dashed border + "松开即插入" hint
- / command trigger at line start -> open CommandPalette
- @ trigger -> structure list popup (topics, goals)
- # trigger -> tag list popup (existing + new). #+space = markdown heading

### 2. features/writing/components/command-palette.tsx
Required features:
- 13 commands: today/review/map/goals/actions/think/search/timeline/settings + h1/h2/todo/quote
- Search filter input
- Keyboard up/down navigation + Enter to select
- Each item: icon + label + optional shortcut hint
- Commands with `insert` field insert markdown text
- Commands without `insert` trigger navigation/overlay

### 3. components/layout/menu-bar.tsx
Required features:
- Fixed top, height 44px
- Auto-hide: invisible by default, mouse enter top 48px area -> slide in, mouse leave 400ms -> fade out
- Left: LuluLogo(24) + "念念有路" (font-serif, text-bark, font-bold) + 4 scene buttons (写作/时间线/地图/目标)
- Current scene button: font-bold text-bark, others: text-bark/50
- Right tools: 🔍search + 🎙voice + ⚡️actions + 📋review + ⚙️settings
- 📋 shows deer-colored dot when new report available
- bg-cream/95 backdrop-blur border-b border-brand-border

### 4. components/layout/overlay.tsx
Required features:
- mode='modal': centered, bg-black/20 backdrop, rounded-xl, max-h-82vh, scroll, default 620px
- mode='sidebar': fixed right, border-l, default 320px
- Backdrop click and Esc both close
- Animations: modal scale-95->1 + opacity, sidebar translateX(100%)->0, 200ms
- Optional title with sticky header + close button

### 5. app/timeline/page.tsx (Scene B: Timeline)
Required features:
- Three-column layout: left 200px + center flex-1 + right 320px
- Left column: structure navigation tree (topics from /cognitive/clusters)
  - Click topic -> filter center column
  - "+ 新主题" button
  - Selected item: bg-cream font-bold
  - Drag diary to topic = manual link
- Center column: diary card flow
  - Each card: avatar + username + timestamp + input-type icon (🎙/✏️/📷/📎)
  - Body text (original, not AI processed)
  - Bottom: topic tags (AI auto) + 💬comment count + 🔗relation count
  - Filter bar: 全部/语音/文字/图片 + time range
- Right column: focus sidebar (hidden by default, appears on diary click)
  - Full original text + 🎙 voice playback
  - Attachments
  - 🔗 Related records with percentage bars
  - 📂 Belonging topic/goal
  - 💬 "和路路聊聊这条记录" button

### 6. app/map/page.tsx (Scene C: Cognitive Map)
Required features:
- Load clusters from /cognitive/clusters API
- Grid layout of cluster cards
- Each card: white bg, rounded-8px, border-2 border-deer, name + record count
- Click card -> right 320px detail panel slides in
- Detail panel shows: members list, contradictions, patterns
- Top toolbar: view switch buttons (网状图/思维导图), auto-layout, zoom-fit, search

### 7. app/goals/page.tsx (Scene D: Goals)
Required features:
- Project -> Goal -> Action three-level nested cards
- Project card: bg-sand, rounded-12px
- Goal card: white bg, rounded-8px, contains action checkboxes
- Actions with skip count show warning badge
- Goal health indicator (4 mini bars: 方向/资源/路径/驱动)
- "未归属目标" section at bottom
- "+ 新建目标" button
- Click goal -> right 360px detail panel: health bars + cognitive narrative + related records

### 8. features/review/components/daily-review.tsx
Required features:
- Uses Overlay mode='modal'
- Tab switch: ☀️晨间 / 🌙晚间
- Morning: action line items + "路路的发现" section (insights)
- Evening: stats + insights + most valuable record + emotion + reflection prompt
- Reflection: dashed border box + one question + "💬 想聊聊吗" button
- All AI text uses 路路 voice (warm, no pressure)

### 9. features/actions/components/action-queue.tsx
Required features:
- Uses Overlay mode='sidebar', 320px
- First item highlighted with blue dot
- Click dot = mark complete
- Right-swipe = "稍后再说"
- Long-press = reason selection (⏳等条件/🚧有阻力/🔄要重想)
- Skip 5+ times: "这件事已经在这里一周了。要聊聊吗？"
- Bottom: collapsible "已完成" section

### 10. features/search/components/global-search.tsx
Required features:
- Uses Overlay mode='modal', 520px
- Search input with debounce
- Results categorized: recent records, matching diaries, topics/goals, people, commands
- Each result: icon + title + summary + shortcut (if command)

### 11. features/chat/components/counselor-chat.tsx
Required features:
- Inline embedded, not full-screen
- LuluLogo as AI avatar
- Messages list with role distinction
- Input + send at bottom, Enter sends (IME-safe)
- API: POST /api/v1/chat/decision
- Each AI response cites source diary references (clickable)
- Support /munger and other framework commands
- Conversation saved as special diary type

After auditing, run `npx tsc --noEmit` to verify.
