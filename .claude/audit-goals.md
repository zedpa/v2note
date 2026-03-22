# Audit: app/goals/page.tsx — Scene D Goals

Read docs/PLAN-pc-design.md section "七、场景D：目标".

## Layout
- [ ] Main area: card flow with right detail panel (360px, hidden by default)
- [ ] Background: bg-cream

## Three-level nested cards (Section 7.1)
- [ ] Project cards (outer): bg-sand, rounded-12px, border border-brand-border
  - [ ] Title row: project name + "项目" tag (bg-bark/10 text-bark) + date range
  - [ ] Contains goal cards horizontally or vertically
- [ ] Goal cards (inner): bg-white, rounded-8px, border border-brand-border
  - [ ] Title: 🎯 + goal name
  - [ ] Action items below: ☐ uncompleted / ☑️ completed (checkbox style)
  - [ ] Actions with skip record: show "跳过N次" badge (text-maple, bg-maple/10)
  - [ ] Bottom: micro health indicator (4 tiny colored bars for 方向/资源/路径/驱动)
- [ ] Click ☐ checkbox → toggle complete status

## Unattributed goals section
- [ ] Below project cards
- [ ] Title: "未归属目标"
- [ ] Lists goals not yet assigned to any project
- [ ] User can drag goals into project cards (console.log for now)

## "+ 新建目标" button
- [ ] At bottom, deer color outline button
- [ ] Click → inline input to type goal name → POST to create

## Right panel: Goal Detail (360px) (Section 7.2)
- [ ] Slides in when goal card clicked
- [ ] Close button
- [ ] Sections:
  1. 🩺 健康度: 4 progress bars (方向/资源/路径/驱动力), each 0-100%
     - Labels below each bar
     - Bar fill color: bark for filled, brand-border for empty
  2. 📖 认知叙事: narrative arc with timeline dots
     - ● 起点 date + quote from diary
     - ● 转折 date + quote
     - ● 冲突 date + quote
     - ○ 悬念 "待解决" or current status
     - Each quote is clickable → jump to timeline
  3. 📝 相关记录: simple timeline of diary summaries
  4. 💬 "深入讨论" button → opens counselor chat with goal context

## Click action item → different right panel content
- [ ] Source diary (where this action was extracted from)
- [ ] Execution history (skip count, completion time)
- [ ] Dependencies (if any)
- [ ] 💬 "聊聊为什么这件事一直没做" button

## Brand compliance
- [ ] All spec colors, no purple/cold gray

After fixing, run: npx tsc --noEmit
