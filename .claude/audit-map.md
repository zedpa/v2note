# Audit: app/map/page.tsx — Scene C Cognitive Map

Read docs/PLAN-pc-design.md section "六、场景C：认知地图".

## Top toolbar (Section 6.1)
- [ ] Two view switch buttons: [🌐 网状图] [🌲 思维导图] (toggle active state)
- [ ] "自动布局" button
- [ ] "缩放适配" button
- [ ] 🔍 search input for filtering nodes
- [ ] Toolbar style: bg-sand, border-b border-brand-border, h-10, px-4

## Network Graph view (Section 6.2)
- [ ] Background: white with 32px grid pattern (CSS background-image)
- [ ] Nodes = cluster cards: white bg, rounded-8px, 2px colored border
  - [ ] Border color based on activity: active=deer, inactive=brand-border
  - [ ] Content: topic name (font-bold) + record count (text-[#9B8E82])
  - [ ] Active nodes: full opacity + shadow-sm; inactive: opacity-70
- [ ] Node positioning: grid layout for now (react-flow later)
- [ ] Click node → right panel slides in with detail
- [ ] Double-click node → expand to show member diary cards (semantic zoom)
- [ ] Drag from one node to another → create manual bond (console.log)

## Mind Map view (Section 6.3)
- [ ] Tree layout expanding from center
- [ ] Hierarchy: Project → Goal → Topic → diary count
- [ ] Indented list with connecting lines
- [ ] Click node → right panel detail

## Right panel: Node Detail (320px) (Section 6.4)
- [ ] Slides in from right on node click
- [ ] Close button
- [ ] Sections:
  1. 📊 概览: record count + last active time + density description
  2. 🎯 相关目标: list of related goals (clickable)
  3. 📝 最近记录: last 5 diary summaries (clickable → jump to timeline)
  4. 🔗 关联主题: other topics with relevance bar (bg-sky/20 fill)

## Brand compliance
- [ ] Colors from spec only, no purple/cold gray
- [ ] Rounded max 12px, shadow max sm

After fixing, run: npx tsc --noEmit
