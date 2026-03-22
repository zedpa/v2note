import { useCallback } from 'react'

type PasteResult =
  | { type: 'image' }
  | { type: 'url'; url: string }
  | { type: 'material'; text: string }
  | { type: 'voice'; text: string }

export function usePasteHandler() {
  const onPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>): PasteResult | void => {
    const { clipboardData } = e

    // Image paste
    const files = Array.from(clipboardData.files)
    const image = files.find(f => f.type.startsWith('image/'))
    if (image) {
      e.preventDefault()
      console.log('[paste] image detected, upload placeholder', image.name)
      return { type: 'image' }
    }

    const text = clipboardData.getData('text/plain')
    if (!text) return

    // URL paste
    if (/^https?:\/\/\S+$/.test(text.trim())) {
      e.preventDefault()
      console.log('[paste] URL detected, import:', text.trim())
      return { type: 'url', url: text.trim() }
    }

    // Long text -> material
    if (text.length > 100) {
      e.preventDefault()
      console.log('[paste] long text detected, treating as material')
      return { type: 'material', text }
    }

    // Short text -> voice
    e.preventDefault()
    console.log('[paste] short text detected, treating as voice')
    return { type: 'voice', text }
  }, [])

  return { onPaste }
}
