'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/shared/lib/api'
import { CommandPalette, COMMANDS } from '@/features/writing/components/command-palette'

function getDateTitle(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = weekdays[now.getDay()]
  return `${month}月${day}日 ${weekday}`
}

export default function WritePage() {
  const [content, setContent] = useState('')
  const [toast, setToast] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePos, setPalettePos] = useState<{ x: number; y: number } | undefined>()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashStartRef = useRef<number | null>(null)

  const lineCount = content.split('\n').length
  const charCount = content.replace(/\s/g, '').length

  const handleSubmit = useCallback(async () => {
    const text = content.trim()
    if (!text || submitting) return
    setSubmitting(true)
    try {
      await api.post('/api/v1/ingest', { type: 'text', content: text })
      setContent('')
      setToast(true)
    } catch {
      // silently fail for now
    } finally {
      setSubmitting(false)
    }
  }, [content, submitting])

  // Auto-hide toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(false), 1500)
    return () => clearTimeout(t)
  }, [toast])

  // Ctrl+Enter shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSubmit])

  // Detect "/" at line start to open command palette
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setContent(value)

      const ta = textareaRef.current
      if (!ta) return

      const cursor = ta.selectionStart
      // Find the start of the current line
      const beforeCursor = value.slice(0, cursor)
      const lineStart = beforeCursor.lastIndexOf('\n') + 1
      const currentLineBeforeCursor = value.slice(lineStart, cursor)

      if (currentLineBeforeCursor === '/') {
        slashStartRef.current = lineStart
        // Calculate caret position for palette placement
        const rect = ta.getBoundingClientRect()
        const lineIndex = beforeCursor.split('\n').length - 1
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 30
        setPalettePos({
          x: rect.left + 16 - (ta.parentElement?.getBoundingClientRect().left ?? 0),
          y: lineIndex * lineHeight + lineHeight + 8,
        })
        setPaletteOpen(true)
      } else if (!currentLineBeforeCursor.startsWith('/')) {
        // Close palette if the slash is gone
        if (paletteOpen) {
          setPaletteOpen(false)
          slashStartRef.current = null
        }
      }
    },
    [paletteOpen]
  )

  const handleCommandSelect = useCallback(
    (commandKey: string) => {
      const cmd = COMMANDS.find((c) => c.key === commandKey)
      if (!cmd) return

      const ta = textareaRef.current
      if (!ta) return

      if (cmd.insert && slashStartRef.current !== null) {
        // Replace the "/" with the insert text
        const before = content.slice(0, slashStartRef.current)
        const afterSlash = content.slice(slashStartRef.current)
        // Remove the "/" from the current line
        const rest = afterSlash.startsWith('/') ? afterSlash.slice(1) : afterSlash
        const newContent = before + cmd.insert + rest
        setContent(newContent)
        // Set cursor after inserted text
        const cursorPos = before.length + cmd.insert.length
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(cursorPos, cursorPos)
        })
      } else {
        // Navigation command — remove the "/" and trigger action
        if (slashStartRef.current !== null) {
          const before = content.slice(0, slashStartRef.current)
          const afterSlash = content.slice(slashStartRef.current)
          const rest = afterSlash.startsWith('/') ? afterSlash.slice(1) : afterSlash
          setContent(before + rest)
        }
        // TODO: route to corresponding panel/page based on commandKey
        console.log('[command]', commandKey)
        requestAnimationFrame(() => ta.focus())
      }

      slashStartRef.current = null
    },
    [content]
  )

  const handlePaletteClose = useCallback(() => {
    setPaletteOpen(false)
    slashStartRef.current = null
    textareaRef.current?.focus()
  }, [])

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="w-full max-w-[680px] mx-auto px-6 flex flex-col flex-1 relative">
        {/* Date header */}
        <div className="pt-10 pb-4">
          <p className="font-serif text-sm text-bark/60">{getDateTitle()}</p>
        </div>

        {/* Editor area */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            placeholder="开始记录...  输入 / 唤起命令"
            autoFocus
            className="w-full min-h-[60vh] bg-transparent border-none outline-none resize-none font-mono text-[15px] leading-[2] text-bark placeholder:text-bark/30"
          />

          {/* Command palette (positioned relative to editor) */}
          <CommandPalette
            isOpen={paletteOpen}
            onClose={handlePaletteClose}
            onSelect={handleCommandSelect}
            position={palettePos}
          />
        </div>

        {/* Status bar */}
        <div className="sticky bottom-0 py-3 flex items-center justify-between text-xs text-bark/50 opacity-0 hover:opacity-100 transition-opacity duration-300">
          <span className="font-mono">Markdown</span>
          <span>{lineCount} 行 · {charCount} 字</span>
          <button
            onClick={handleSubmit}
            disabled={submitting || !content.trim()}
            className="px-3 py-1 rounded bg-bark/10 hover:bg-bark/20 text-bark/70 disabled:opacity-30 transition-colors"
          >
            Ctrl+Enter 提交
          </button>
        </div>

        {/* Toast */}
        {toast && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm text-bark/80 bg-sand px-4 py-2 rounded-lg shadow animate-card-enter">
            ✓ 路路收到了
          </div>
        )}
      </div>
    </div>
  )
}
