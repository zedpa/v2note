'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Command {
  key: string
  icon: string
  label: string
  shortcut?: string
  insert?: string
}

const COMMANDS: Command[] = [
  { key: 'today', icon: '📋', label: '今日计划', shortcut: 'Ctrl+D' },
  { key: 'review', icon: '🌙', label: '晚间总结' },
  { key: 'map', icon: '🗺', label: '认知地图', shortcut: 'Ctrl+2' },
  { key: 'goals', icon: '🎯', label: '目标看板', shortcut: 'Ctrl+3' },
  { key: 'actions', icon: '⚡', label: '行动队列' },
  { key: 'think', icon: '💡', label: '决策分析' },
  { key: 'search', icon: '🔍', label: '搜索记录', shortcut: 'Ctrl+K' },
  { key: 'timeline', icon: '📝', label: '时间线', shortcut: 'Ctrl+1' },
  { key: 'settings', icon: '⚙️', label: '设置' },
  { key: 'h1', icon: 'H1', label: '一级标题', insert: '# ' },
  { key: 'h2', icon: 'H2', label: '二级标题', insert: '## ' },
  { key: 'todo', icon: '☐', label: '待办项', insert: '- [ ] ' },
  { key: 'quote', icon: '>', label: '引用', insert: '> ' },
]

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (command: Command) => void
  position?: { x: number; y: number }
}

export function CommandPalette({ isOpen, onClose, onSelect, position }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = query
    ? COMMANDS.filter(
        (c) =>
          c.label.includes(query) ||
          c.key.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      // Focus input on next tick
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // Keep active index in bounds
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length, activeIndex])

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return
    const active = listRef.current.children[activeIndex] as HTMLElement | undefined
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const handleSelect = useCallback(
    (cmd: Command) => {
      onSelect(cmd)
      onClose()
    },
    [onSelect, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => (i + 1) % filtered.length)
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length)
          break
        case 'Enter':
          e.preventDefault()
          if (filtered[activeIndex]) handleSelect(filtered[activeIndex])
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [filtered, activeIndex, handleSelect, onClose]
  )

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('[data-command-palette]')) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const style: React.CSSProperties = position
    ? { position: 'absolute', left: position.x, top: position.y }
    : {}

  return (
    <div
      data-command-palette
      className="bg-cream border border-brand-border rounded-xl shadow-lg p-2 w-[260px] z-50 animate-card-enter"
      style={style}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(0)
        }}
        onKeyDown={handleKeyDown}
        placeholder="搜索命令..."
        className="w-full px-3 py-1.5 mb-1 text-sm bg-transparent border-none outline-none text-bark placeholder:text-bark/40"
      />

      {/* Command list */}
      <div ref={listRef} className="max-h-[320px] overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-sm text-bark/40">无匹配命令</div>
        )}
        {filtered.map((cmd, i) => (
          <button
            key={cmd.key}
            onClick={() => handleSelect(cmd)}
            onMouseEnter={() => setActiveIndex(i)}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-bark transition-colors ${
              i === activeIndex ? 'bg-sand' : 'hover:bg-sand'
            }`}
          >
            <span className="w-6 text-center shrink-0">{cmd.icon}</span>
            <span className="flex-1 text-left">{cmd.label}</span>
            {cmd.shortcut && (
              <span className="text-xs text-bark/40 font-mono">{cmd.shortcut}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export { COMMANDS }
export type { Command }
