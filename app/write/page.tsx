'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '@/shared/lib/api'
import { toast as sonnerToast } from 'sonner'
import { CommandPalette, type Command } from '@/features/writing/components/command-palette'

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URL prefix (e.g. "data:image/png;base64,")
      resolve(result.includes(',') ? result.split(',')[1] : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getDateTitle(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const day = now.getDate()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const weekday = weekdays[now.getDay()]
  return `${month}月${day}日 ${weekday}`
}

const DRAFT_KEY = 'v2note:draft'

interface PopupItem {
  id: string
  label: string
}

export default function WritePage() {
  const [content, setContent] = useState('')
  const [toast, setToast] = useState(false)
  const [toastText, setToastText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [palettePos, setPalettePos] = useState<{ x: number; y: number } | undefined>()
  const [dragging, setDragging] = useState(false)
  const [pasteModal, setPasteModal] = useState<{ text: string } | null>(null)

  // @ popup state
  const [atOpen, setAtOpen] = useState(false)
  const [atPos, setAtPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [atItems, setAtItems] = useState<PopupItem[]>([])
  const [atFilter, setAtFilter] = useState('')
  const [atSelected, setAtSelected] = useState(0)
  const atStartRef = useRef<number | null>(null)

  // # popup state
  const [hashOpen, setHashOpen] = useState(false)
  const [hashPos, setHashPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [hashItems, setHashItems] = useState<PopupItem[]>([])
  const [hashFilter, setHashFilter] = useState('')
  const [hashSelected, setHashSelected] = useState(0)
  const hashStartRef = useRef<number | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const slashStartRef = useRef<number | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const lineCount = content.split('\n').length
  const charCount = content.replace(/\s/g, '').length

  // Load draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY)
      if (saved) setContent(saved)
    } catch { /* ignore */ }
  }, [])

  // Auto-save every 30s
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(() => {
      try {
        const text = content
        if (text) {
          localStorage.setItem(DRAFT_KEY, text)
        }
      } catch { /* ignore */ }
    }, 30_000)
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current)
    }
  }, [content])

  const saveDraft = useCallback(() => {
    try {
      if (content) {
        localStorage.setItem(DRAFT_KEY, content)
      } else {
        localStorage.removeItem(DRAFT_KEY)
      }
    } catch { /* ignore */ }
  }, [content])

  const handleSubmit = useCallback(async () => {
    const text = content.trim()
    if (!text || submitting) return
    setSubmitting(true)
    const firstLine = text.split('\n')[0].slice(0, 10)
    try {
      await api.post('/api/v1/ingest', { type: 'text', content: text })
      setContent('')
      localStorage.removeItem(DRAFT_KEY)
      setToastText(firstLine)
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

  // Ctrl+Enter submit, Ctrl+S save draft
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        saveDraft()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleSubmit, saveDraft])

  // Helper: compute popup position from cursor in textarea
  const getPopupPos = useCallback((ta: HTMLTextAreaElement, beforeCursor: string) => {
    const rect = ta.getBoundingClientRect()
    const lineIndex = beforeCursor.split('\n').length - 1
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 30
    return {
      x: rect.left + 16 - (ta.parentElement?.getBoundingClientRect().left ?? 0),
      y: lineIndex * lineHeight + lineHeight + 8,
    }
  }, [])

  // Load @ items (clusters + goals)
  const loadAtItems = useCallback(async () => {
    try {
      const [clusters, goals] = await Promise.all([
        api.get<Array<{ id: string; name: string }>>('/api/v1/cognitive/clusters').catch(() => []),
        api.get<Array<{ id: string; title: string }>>('/api/v1/goals').catch(() => []),
      ])
      const items: PopupItem[] = [
        ...(clusters ?? []).map((c) => ({ id: `topic:${c.id}`, label: c.name })),
        ...(goals ?? []).map((g) => ({ id: `goal:${g.id}`, label: g.title })),
      ]
      setAtItems(items)
    } catch {
      setAtItems([])
    }
  }, [])

  // Load # items (tags)
  const loadHashItems = useCallback(async () => {
    try {
      const tags = await api.get<Array<{ id: string; name: string }>>('/api/v1/tags').catch(() => [])
      setHashItems((tags ?? []).map((t) => ({ id: t.id, label: t.name })))
    } catch {
      setHashItems([])
    }
  }, [])

  // Detect "/", "@", "#" triggers
  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      setContent(value)

      const ta = textareaRef.current
      if (!ta) return

      const cursor = ta.selectionStart
      const beforeCursor = value.slice(0, cursor)
      const lineStart = beforeCursor.lastIndexOf('\n') + 1
      const currentLineBeforeCursor = value.slice(lineStart, cursor)

      // --- / command palette ---
      if (currentLineBeforeCursor === '/') {
        slashStartRef.current = lineStart
        setPalettePos(getPopupPos(ta, beforeCursor))
        setPaletteOpen(true)
      } else if (!currentLineBeforeCursor.startsWith('/')) {
        if (paletteOpen) {
          setPaletteOpen(false)
          slashStartRef.current = null
        }
      }

      // --- @ trigger ---
      const atMatch = currentLineBeforeCursor.match(/@([^@\s]*)$/)
      if (atMatch) {
        const triggerOffset = lineStart + currentLineBeforeCursor.lastIndexOf('@')
        if (atStartRef.current === null) {
          atStartRef.current = triggerOffset
          loadAtItems()
        }
        setAtFilter(atMatch[1])
        setAtPos(getPopupPos(ta, beforeCursor))
        setAtOpen(true)
        setAtSelected(0)
      } else if (atOpen) {
        setAtOpen(false)
        atStartRef.current = null
        setAtFilter('')
      }

      // --- # trigger ---
      const hashMatch = currentLineBeforeCursor.match(/#([^#\s]*)$/)
      // # followed by a space is a markdown heading, not a tag trigger
      if (hashMatch && !currentLineBeforeCursor.endsWith('# ')) {
        const triggerOffset = lineStart + currentLineBeforeCursor.lastIndexOf('#')
        if (hashStartRef.current === null) {
          hashStartRef.current = triggerOffset
          loadHashItems()
        }
        setHashFilter(hashMatch[1])
        setHashPos(getPopupPos(ta, beforeCursor))
        setHashOpen(true)
        setHashSelected(0)
      } else if (hashOpen) {
        setHashOpen(false)
        hashStartRef.current = null
        setHashFilter('')
      }
    },
    [paletteOpen, atOpen, hashOpen, getPopupPos, loadAtItems, loadHashItems]
  )

  // Handle keyboard navigation for @ and # popups
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (atOpen) {
        const filtered = atItems.filter((i) =>
          i.label.toLowerCase().includes(atFilter.toLowerCase())
        )
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setAtSelected((s) => Math.min(s + 1, filtered.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setAtSelected((s) => Math.max(s - 1, 0))
          return
        }
        if (e.key === 'Enter' && filtered.length > 0) {
          e.preventDefault()
          const item = filtered[atSelected]
          if (item && atStartRef.current !== null) {
            const before = content.slice(0, atStartRef.current)
            const afterTrigger = content.slice(textareaRef.current?.selectionStart ?? content.length)
            const newContent = before + `@${item.label} ` + afterTrigger
            setContent(newContent)
            const cursorPos = before.length + item.label.length + 2
            requestAnimationFrame(() => {
              textareaRef.current?.focus()
              textareaRef.current?.setSelectionRange(cursorPos, cursorPos)
            })
          }
          setAtOpen(false)
          atStartRef.current = null
          setAtFilter('')
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setAtOpen(false)
          atStartRef.current = null
          setAtFilter('')
          return
        }
      }

      if (hashOpen) {
        const filtered = hashItems.filter((i) =>
          i.label.toLowerCase().includes(hashFilter.toLowerCase())
        )
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHashSelected((s) => Math.min(s + 1, filtered.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHashSelected((s) => Math.max(s - 1, 0))
          return
        }
        if (e.key === 'Enter' && filtered.length > 0) {
          e.preventDefault()
          const item = filtered[hashSelected]
          if (item && hashStartRef.current !== null) {
            const before = content.slice(0, hashStartRef.current)
            const afterTrigger = content.slice(textareaRef.current?.selectionStart ?? content.length)
            const newContent = before + `#${item.label} ` + afterTrigger
            setContent(newContent)
            const cursorPos = before.length + item.label.length + 2
            requestAnimationFrame(() => {
              textareaRef.current?.focus()
              textareaRef.current?.setSelectionRange(cursorPos, cursorPos)
            })
          }
          setHashOpen(false)
          hashStartRef.current = null
          setHashFilter('')
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setHashOpen(false)
          hashStartRef.current = null
          setHashFilter('')
          return
        }
      }
    },
    [atOpen, atItems, atFilter, atSelected, hashOpen, hashItems, hashFilter, hashSelected, content]
  )

  const handleCommandSelect = useCallback(
    (cmd: Command) => {
      const ta = textareaRef.current
      if (!ta) return

      if (cmd.insert && slashStartRef.current !== null) {
        const before = content.slice(0, slashStartRef.current)
        const afterSlash = content.slice(slashStartRef.current)
        const rest = afterSlash.startsWith('/') ? afterSlash.slice(1) : afterSlash
        const newContent = before + cmd.insert + rest
        setContent(newContent)
        const cursorPos = before.length + cmd.insert.length
        requestAnimationFrame(() => {
          ta.focus()
          ta.setSelectionRange(cursorPos, cursorPos)
        })
      } else {
        if (slashStartRef.current !== null) {
          const before = content.slice(0, slashStartRef.current)
          const afterSlash = content.slice(slashStartRef.current)
          const rest = afterSlash.startsWith('/') ? afterSlash.slice(1) : afterSlash
          setContent(before + rest)
        }
        console.log('[command]', cmd.key)
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

  // Drag-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragging(false)
    }
  }, [])
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)

      const ta = textareaRef.current
      const cursor = ta?.selectionStart ?? content.length

      // Handle dropped text / URLs
      const text = e.dataTransfer.getData('text/plain')
      const uri = e.dataTransfer.getData('text/uri-list')

      let insertText = ''

      if (e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files)
        insertText = files
          .map((f) => {
            const isImage = f.type.startsWith('image/')
            return isImage ? `[📷 ${f.name}]` : `[📎 ${f.name}]`
          })
          .join('\n')
        // Fire-and-forget uploads
        for (const f of files) {
          const isImage = f.type.startsWith('image/')
          fileToBase64(f).then((base64) => {
            if (isImage) {
              return api.post<{ description?: string }>('/api/v1/ingest', {
                type: 'image', file_base64: base64, source_type: 'material',
              }).then((res) => sonnerToast.success(`图片已收录${res.description ? ` · ${res.description.slice(0, 30)}` : ''}`))
            } else {
              return api.post<{ preview?: string }>('/api/v1/ingest', {
                type: 'file', file_base64: base64, filename: f.name, mimeType: f.type, source_type: 'material',
              }).then((res) => sonnerToast.success(`${f.name} 已收录${res.preview ? ` · ${res.preview.slice(0, 30)}` : ''}`))
            }
          }).catch(() => sonnerToast.error(`${f.name} 上传失败`))
        }
      } else if (uri) {
        insertText = `[🌐 ${uri}]`
        api.post<{ title?: string }>('/api/v1/ingest', {
          type: 'url', content: uri, source_type: 'material',
        }).then((res) => sonnerToast.success(`链接已收录${res.title ? ` · ${res.title}` : ''}`))
          .catch(() => sonnerToast.error('链接提取失败'))
      } else if (text) {
        insertText = text
      }

      if (insertText) {
        const before = content.slice(0, cursor)
        const after = content.slice(cursor)
        const newContent = before + insertText + after
        setContent(newContent)
        const newCursor = before.length + insertText.length
        requestAnimationFrame(() => {
          ta?.focus()
          ta?.setSelectionRange(newCursor, newCursor)
        })
      }
    },
    [content]
  )

  // Insert text at cursor helper
  const insertAtCursor = useCallback(
    (text: string) => {
      const ta = textareaRef.current
      const cursor = ta?.selectionStart ?? content.length
      const before = content.slice(0, cursor)
      const after = content.slice(cursor)
      const newContent = before + text + after
      setContent(newContent)
      const newCursor = before.length + text.length
      requestAnimationFrame(() => {
        ta?.focus()
        ta?.setSelectionRange(newCursor, newCursor)
      })
    },
    [content]
  )

  // Paste handling
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items
      // Check for pasted images
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          insertAtCursor('[📷 image]')
          if (file) {
            fileToBase64(file).then((base64) =>
              api.post<{ recordId: string; description?: string }>('/api/v1/ingest', {
                type: 'image', file_base64: base64, source_type: 'material',
              })
            ).then((res) => {
              sonnerToast.success(`图片已收录${res.description ? ` · ${res.description.slice(0, 30)}` : ''}`)
            }).catch(() => sonnerToast.error('图片上传失败'))
          }
          return
        }
      }

      const text = e.clipboardData.getData('text/plain')
      if (!text) return

      // URL paste
      if (/^https?:\/\//.test(text.trim())) {
        e.preventDefault()
        const url = text.trim()
        insertAtCursor(`[🌐 ${url}]`)
        api.post<{ recordId: string; title?: string; preview?: string }>('/api/v1/ingest', {
          type: 'url', content: url, source_type: 'material',
        }).then((res) => {
          sonnerToast.success(`链接已收录${res.title ? ` · ${res.title}` : ''}`)
        }).catch(() => sonnerToast.error('链接提取失败'))
        return
      }

      // Long text paste (>=100 chars) - show modal
      if (text.length >= 100) {
        e.preventDefault()
        setPasteModal({ text })
        return
      }

      // Short text (<100 chars) - let default paste behavior handle it
    },
    [insertAtCursor]
  )

  // Paste modal handlers
  const handlePasteAsMaterial = useCallback(() => {
    if (pasteModal) {
      const preview = pasteModal.text.slice(0, 30)
      insertAtCursor(`[📄 粘贴素材: ${preview}...]`)
      api.post('/api/v1/ingest', {
        type: 'text', content: pasteModal.text, source_type: 'material',
      }).then(() => sonnerToast.success('素材已收录'))
        .catch(() => sonnerToast.error('素材收录失败'))
      setPasteModal(null)
    }
  }, [pasteModal, insertAtCursor])

  const handlePasteAsText = useCallback(() => {
    if (pasteModal) {
      insertAtCursor(pasteModal.text)
      setPasteModal(null)
    }
  }, [pasteModal, insertAtCursor])

  // Filter items for popups
  const filteredAtItems = atItems.filter((i) =>
    i.label.toLowerCase().includes(atFilter.toLowerCase())
  )
  const filteredHashItems = hashItems.filter((i) =>
    i.label.toLowerCase().includes(hashFilter.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div
        className="w-full max-w-[680px] mx-auto px-6 pb-16 flex flex-col flex-1 relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Date header */}
        <div className="pt-16 pb-4">
          <p className="font-serif text-sm text-[#9B8E82]">{getDateTitle()}</p>
          <div className="mt-3 border-t border-brand-border" />
        </div>

        {/* Editor area */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onPaste={handlePaste}
            placeholder="开始记录..."
            autoFocus
            className="w-full min-h-[60vh] bg-transparent border-none outline-none resize-none font-mono text-[15px] leading-[2] text-[#2C2520] placeholder:text-bark/30"
          />

          {/* Command palette (positioned relative to editor) */}
          <CommandPalette
            isOpen={paletteOpen}
            onClose={handlePaletteClose}
            onSelect={handleCommandSelect}
            position={palettePos}
          />

          {/* @ popup: structure list (topics + goals) */}
          {atOpen && filteredAtItems.length > 0 && (
            <ul
              className="absolute z-50 bg-white rounded-lg shadow-sm border border-brand-border py-1 max-h-48 overflow-y-auto w-56"
              style={{ left: atPos.x, top: atPos.y }}
            >
              {filteredAtItems.map((item, i) => (
                <li
                  key={item.id}
                  className={`px-3 py-1.5 text-sm cursor-pointer ${
                    i === atSelected
                      ? 'bg-sand text-bark font-medium'
                      : 'text-bark/80 hover:bg-sand/60'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (atStartRef.current !== null) {
                      const before = content.slice(0, atStartRef.current)
                      const afterTrigger = content.slice(
                        textareaRef.current?.selectionStart ?? content.length
                      )
                      const newContent = before + `@${item.label} ` + afterTrigger
                      setContent(newContent)
                      const cursorPos = before.length + item.label.length + 2
                      requestAnimationFrame(() => {
                        textareaRef.current?.focus()
                        textareaRef.current?.setSelectionRange(cursorPos, cursorPos)
                      })
                    }
                    setAtOpen(false)
                    atStartRef.current = null
                    setAtFilter('')
                  }}
                >
                  <span className="mr-1.5 text-bark/40">
                    {item.id.startsWith('topic:') ? '📂' : '🎯'}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          )}

          {/* # popup: tag list */}
          {hashOpen && filteredHashItems.length > 0 && (
            <ul
              className="absolute z-50 bg-white rounded-lg shadow-sm border border-brand-border py-1 max-h-48 overflow-y-auto w-48"
              style={{ left: hashPos.x, top: hashPos.y }}
            >
              {filteredHashItems.map((item, i) => (
                <li
                  key={item.id}
                  className={`px-3 py-1.5 text-sm cursor-pointer ${
                    i === hashSelected
                      ? 'bg-sand text-bark font-medium'
                      : 'text-bark/80 hover:bg-sand/60'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (hashStartRef.current !== null) {
                      const before = content.slice(0, hashStartRef.current)
                      const afterTrigger = content.slice(
                        textareaRef.current?.selectionStart ?? content.length
                      )
                      const newContent = before + `#${item.label} ` + afterTrigger
                      setContent(newContent)
                      const cursorPos = before.length + item.label.length + 2
                      requestAnimationFrame(() => {
                        textareaRef.current?.focus()
                        textareaRef.current?.setSelectionRange(cursorPos, cursorPos)
                      })
                    }
                    setHashOpen(false)
                    hashStartRef.current = null
                    setHashFilter('')
                  }}
                >
                  <span className="mr-1.5 text-bark/40">#</span>
                  {item.label}
                </li>
              ))}
              {hashFilter && !hashItems.some((i) => i.label === hashFilter) && (
                <li
                  className="px-3 py-1.5 text-sm cursor-pointer text-bark/60 hover:bg-sand/60 border-t border-brand-border"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (hashStartRef.current !== null) {
                      const before = content.slice(0, hashStartRef.current)
                      const afterTrigger = content.slice(
                        textareaRef.current?.selectionStart ?? content.length
                      )
                      const newContent = before + `#${hashFilter} ` + afterTrigger
                      setContent(newContent)
                      const cursorPos = before.length + hashFilter.length + 2
                      requestAnimationFrame(() => {
                        textareaRef.current?.focus()
                        textareaRef.current?.setSelectionRange(cursorPos, cursorPos)
                      })
                    }
                    setHashOpen(false)
                    hashStartRef.current = null
                    setHashFilter('')
                  }}
                >
                  + 新建标签 &quot;{hashFilter}&quot;
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Drag-drop overlay */}
        {dragging && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-cream/80 border-2 border-dashed border-deer rounded-xl pointer-events-none">
            <span className="text-bark/60 text-lg">松开即插入</span>
          </div>
        )}

        {/* Status bar */}
        <div className="sticky bottom-0 py-3 flex items-center justify-between text-xs text-bark/50 opacity-0 hover:opacity-100 transition-opacity duration-200">
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
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 text-sm text-bark/80 bg-sand px-4 py-2 rounded-lg shadow-sm animate-card-enter">
            ✓ 路路收到了{toastText ? ` · 关于${toastText}` : ''}
          </div>
        )}

        {/* Paste modal */}
        {pasteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-bark/20">
            <div className="bg-cream rounded-xl shadow-sm border border-brand-border px-6 py-5 max-w-sm">
              <p className="text-sm text-[#2C2520] mb-4">作为素材导入？</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handlePasteAsText}
                  className="px-3 py-1.5 text-sm rounded-lg text-bark/70 hover:bg-sand transition-colors duration-200"
                >
                  否
                </button>
                <button
                  onClick={handlePasteAsMaterial}
                  className="px-3 py-1.5 text-sm rounded-lg bg-deer text-white hover:bg-deer/90 transition-colors duration-200"
                >
                  是
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
