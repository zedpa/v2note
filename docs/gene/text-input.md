## gene_text_input
### 功能描述
文本输入与命令对话。TextBottomSheet 支持输入文字笔记，输入 / 立即进入流式命令对话模式（不再显示小型补全框）。

### 详细功能
- 功能1：自定义固定底部抽屉（取代 vaul Drawer，解决键盘跳位问题）
- 功能2：visualViewport API 监听键盘高度，输入框始终贴键盘上边沿
- 功能3：输入 "/" 后立即关闭输入框，进入流式 AI 指令对话（ChatView）
- 功能4：命令模式 AI 行为约束——AI 仅能根据用户指令修改设置（soul/memory/skills/settings），必须实事求是，不承诺自己做不到的功能，不编造能力
- 功能5：普通文本创建手动笔记（通过 API）
- 功能6：命令执行通过 registry 路由（非 / 前缀时保持原有逻辑）

### 关键文件
- `features/recording/components/text-bottom-sheet.tsx` — 自定义底部抽屉（keyboard-safe）
- `features/recording/components/fab.tsx` — 传递 onOpenCommandChat 回调
- `features/chat/components/chat-view.tsx` — 支持 initialMessage 自动发送
- `app/page.tsx` — 处理 onOpenCommandChat → 开启指令对话
- `features/notes/lib/manual-note.ts`

### UI 规格（v2026.02.27d）
- 底部抽屉：条件渲染 `{open && <div>}`，animate-slide-up-sheet（避免 translate-y-full 在 Android 不触发）
- 使用 visualViewport.resize 事件计算键盘偏移量 `bottom: ${bottomOffset}px`
- "/" 检测：正则 `/^\/\s*$/` 兼容 Android IME 尾随空格/换行
- "/" 触发 ChatView 时，通过 chat.start 中的 `mode:"command"+initialMessage` 直接响应，不先触发复盘
- FAB tap 处理：onClick 作为主 tap 处理器（移动端可靠），longPressTriggeredRef 防止录音结束后误触打开 sheet；setPointerCapture 仅在长按进入录音后调用

### 测试描述
- 输入：点击 FAB → 输入 "/" → 立即跳转到 AI 对话界面
- 输出：AI 列出所有可用命令，用户可通过对话执行配置操作
- 输入：点击 FAB → 输入文字 → 回车
- 输出：创建普通笔记
