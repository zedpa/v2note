# Current Task: W4-01 Action Queue Sidebar

## Context
Read `docs/genes.md` for project overview. This is a Next.js + React + TypeScript + TailwindCSS project.

## Task
Create `features/actions/components/action-queue.tsx`

## Requirements
1. Import `Overlay` from `@/components/layout/overlay` (mode='sidebar')
2. Import `fetchActionPanel` from `@/shared/lib/api/action-panel`
3. Props: `isOpen: boolean`, `onClose: () => void`
4. On mount when isOpen, call fetchActionPanel() to load data
5. Render `panel.today` as a list: each item shows a circle dot + text + goalName
6. First item highlighted with blue dot, rest gray
7. Click dot marks complete (console.log for now)
8. Bottom: collapsible "已完成" section (placeholder)
9. Use brand colors: bg-cream, text-bark, border-brand-border

## Constraints
- Use existing project patterns (check nearby components for style)
- No new dependencies
- Must pass: `npx tsc --noEmit`
