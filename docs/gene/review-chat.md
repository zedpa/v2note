## gene_review_chat
### 功能描述
复盘对话功能。基于时间范围内的录音记录，与 AI 进行复盘对话。日期选择简化为 4 个快捷按钮，集成技能开关。

### 详细功能
- 功能1：4 个日期快捷按钮（近7天、近1月、近半年、全部日记），点击直接生成
- 功能2：加载范围内录音转写和记忆
- 功能3：流式 AI 对话（ChatBubble 消息气泡，用户右对齐 / AI 左对齐，内容三元渲染避免重复）；assistant消息使用MarkdownContent渲染
- 功能4：对话结束后更新 soul（AI 身份定义）
- 功能5：RadioGroup 复盘视角选择器（无视角/各review技能单选），选择存储在 LocalSkills.selectedReviewSkill
- 功能6：历史复盘列表（preview使用stripMarkdown清理markdown标记）
- 功能7：命令模式约束——Gateway chat.ts 命令模式 system prompt 明确告知 AI：仅能修改 soul/memory/skills/settings，实事求是，不承诺做不到的能力
- 功能8：chat.start 发送 localConfig（含技能开关配置），Gateway chat.ts 用 filterActiveSkills 过滤，用户的技能开关在复盘对话中生效
- 功能9：技能面板合并策略——服务端返回的技能优先，本地 DEFAULT_SKILLS 中服务端未知的技能追加保留
- 功能10：复盘结果使用MarkdownContent渲染 + cleanDates()将ISO日期转中文格式
- 功能11："/"命令列表可点击——ChatView检测到命令列表消息后渲染command chip按钮，点击先尝试本地命令执行再发送到gateway
- 功能12：指令模式会话管理——`sessionStartedRef` 跟踪gateway会话状态，"/"引导模式下send()自动补发chat.start；`connectGenRef` 防止旧异步回调覆盖新连接；disconnect改为同步（fire-and-forget chat.end）避免与connect竞态

### 关键文件
- `features/chat/components/chat-view.tsx` — 含命令chip渲染
- `features/chat/components/chat-bubble.tsx` — assistant消息MarkdownContent
- `features/chat/hooks/use-chat.ts`
- `features/reviews/components/review-result.tsx` — MarkdownContent + cleanDates
- `features/reviews/components/review-list.tsx` — stripMarkdown预览
- `shared/components/markdown-content.tsx` — 共享markdown渲染+stripMarkdown工具
- `gateway/src/handlers/chat.ts`
- `features/reviews/components/review-overlay.tsx` — 复盘主界面
- `features/reviews/components/date-selector.tsx` — 快捷日期选择

### 测试描述
- 输入：打开复盘 → 点击"近7天"
- 输出：直接生成复盘，AI 基于近 7 天记录进行对话，markdown格式正确渲染
- 输入："/"命令模式 → 命令列表显示
- 输出：每个命令显示为可点击chip按钮
