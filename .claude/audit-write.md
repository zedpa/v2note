# Audit: app/write/page.tsx — Scene A Writing Panel

Read docs/PLAN-pc-design.md sections "四、场景A：写作" and "二、视觉语言" for full requirements.
Read docs/brand-identity.html for brand colors and fonts.
Read the current app/write/page.tsx.
Compare and fix ALL missing features:

## Layout (Section 4.1)
- [ ] Full screen centered, max-w-[680px], mx-auto, generous top/bottom padding
- [ ] Background: bg-cream (#FAF6F0)
- [ ] Date title auto-generated: "3月21日 周六" format, font-serif (Noto Serif SC), text-sm, color text-[#9B8E82] (weak text)
- [ ] Thin divider line below date

## Editor (Section 4.2)
- [ ] Monospace font: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace
- [ ] Font size 15px, line-height 2x (leading-[2])
- [ ] Text color: text-[#2C2520] (primary text)
- [ ] Transparent background, no border, no outline
- [ ] min-height 60vh
- [ ] Placeholder: "开始记录..."
- [ ] Autofocus on mount

## Keyboard shortcuts
- [ ] Ctrl+Enter: submit content → POST /api/v1/ingest {type:'text', content} → clear editor → show feedback
- [ ] Ctrl+S: save draft to localStorage (key: 'v2note:draft')
- [ ] Auto-save every 30 seconds to localStorage
- [ ] On page load, restore draft from localStorage if exists

## Submit feedback (Section 4.4)
- [ ] After submit, bottom shows: "✓ 路路收到了 · 关于XXX" (1.5s then fade out)
- [ ] This is a fixed-duration frontend animation, does NOT wait for AI processing
- [ ] The "关于XXX" part can be extracted from first line of content (first 10 chars)

## Bottom status bar
- [ ] Default invisible (opacity-0), visible on hover (hover:opacity-100 transition)
- [ ] Left: "Markdown" text label
- [ ] Center: line count + "行" · word count + "字" (real-time as user types)
- [ ] Right: "Ctrl+Enter" hint + submit button

## Drag-drop (Section 4.2)
- [ ] When file/image dragged over editor, show dashed border + "松开即插入" text
- [ ] On drop: insert block format at cursor: [📎 filename.ext] or [📷 image.jpg] or [🌐 url]
- [ ] The actual upload is a console.log placeholder for now

## Paste handling (Section 4.2 + 十五 attachments)
- [ ] Paste image: insert [📷 image] block, console.log upload
- [ ] Paste URL (starts with http): insert [🌐 url] block
- [ ] Paste short text (<100 chars): insert as normal text (原声/voice)
- [ ] Paste long text (>=100 chars): show a small modal asking "作为素材导入？" [是] [否]
  - Yes → insert as dimmed block [📄 粘贴素材: first 30 chars...]
  - No → insert as normal text

## / Command trigger (Section 4.3)
- [ ] When user types "/" at beginning of a line, open CommandPalette component
- [ ] CommandPalette appears positioned near cursor
- [ ] After selecting a command with 'insert' field, replace the "/" with the insert text
- [ ] After selecting a navigation command, trigger scene change (console.log for now)

## @ trigger (Section 4.3)
- [ ] When user types "@", show a dropdown of existing topics (from /cognitive/clusters API)
- [ ] Selecting a topic inserts: @主题名 as highlighted inline text
- [ ] This creates a manual link when submitted (passed as metadata in ingest)

## # trigger (Section 4.3)
- [ ] When user types "#" NOT followed by space, show tag dropdown (fetch existing tags)
- [ ] Selecting a tag inserts: #标签名
- [ ] When user types "# " (hash+space), do NOT show dropdown, treat as markdown H1
- [ ] User-created tags via # have higher weight than AI auto-tags

## Brand compliance (Section 2)
- [ ] No purple gradients, no cold grays
- [ ] Border-radius max 12px
- [ ] Shadows max shadow-sm
- [ ] Animation duration max 200ms, easing ease-out

After fixing, run: npx tsc --noEmit
