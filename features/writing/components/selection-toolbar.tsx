'use client'

import { Search, Lightbulb, Pin } from 'lucide-react'

type SelectionAction = 'related' | 'analyze' | 'create-action'

interface SelectionToolbarProps {
  position: { x: number; y: number }
  onAction: (action: SelectionAction) => void
}

const actions = [
  { key: 'related' as const, icon: Search, label: '关联' },
  { key: 'analyze' as const, icon: Lightbulb, label: '分析' },
  { key: 'create-action' as const, icon: Pin, label: '创建行动' },
]

export function SelectionToolbar({ position, onAction }: SelectionToolbarProps) {
  return (
    <div
      className="absolute z-50 flex items-center gap-1 bg-cream dark:bg-popover px-2 py-1.5 shadow-lg rounded-lg border border-brand-border dark:border-border animate-card-enter"
      style={{ left: position.x, top: position.y }}
    >
      {actions.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onAction(key)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-bark/80 dark:text-foreground/80 rounded-md transition-colors hover:bg-sand dark:hover:bg-secondary hover:text-bark dark:hover:text-foreground"
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
