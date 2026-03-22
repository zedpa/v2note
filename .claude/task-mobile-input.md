# Task: Mobile unified input bar

Read docs/PLAN-multimodal-input.md section "移动端输入统一到文本框".
Read features/recording/components/text-bottom-sheet.tsx for existing text input pattern.
Read features/recording/components/fab.tsx for existing FAB.

## Create: features/recording/components/unified-input.tsx

A bottom sheet input component that replaces the separate FAB actions.

Props:
- isOpen: boolean
- onClose: () => void
- onSubmit: (data: {type: string, content?: string, file?: any}) => void
- onRecordPress: () => void  // switches to recording interface

Layout (bottom sheet, not full screen):
```
┌─────────────────────────────────────┐
│  (drag handle)                      │
│                                     │
│  [attached file preview if any]     │
│  [link preview card if URL detected]│
│                                     │
│  (multi-line text input area)       │
│  开始记录...                         │
│                                     │
├─────────────────────────────────────┤
│  📎  │  输入或粘贴...        │  🎙  │
└─────────────────────────────────────┘
```

Features:
1. 📎 button (left): opens action sheet with options:
   - 📷 拍照 (console.log placeholder - Capacitor Camera later)
   - 🖼 从相册选择 (console.log placeholder)
   - 📄 选择文件 (console.log placeholder)
   Each option sets an attachment state, shows preview above input

2. 🎙 button (right): calls onRecordPress() to switch to recording interface
   After recording completes, transcribed text is passed back via onSubmit

3. Text input: multi-line textarea, auto-resize
   - Detect URL paste: if text contains http:// or https://, show link preview card above input
   - Link preview: title "链接已识别" + URL text + [导入内容] button
   - [导入内容] calls onSubmit({type:'url', content: url})

4. Send: Enter key (not Shift+Enter) or send button → onSubmit({type:'text', content})
   With attachment → onSubmit({type:'image'|'file', content: textNote, file: attachment})

5. Style: bg-cream, rounded-t-2xl, border-t border-brand-border, backdrop-blur
   Input font: text-sm, text-bark
   Buttons: text-deer hover:text-antler

## Integration note:
Do NOT modify app/page.tsx or fab.tsx in this task. Just create the component.

Run: npx tsc --noEmit
