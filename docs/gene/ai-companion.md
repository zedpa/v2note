# gene_ai_companion — AI 伴侣窗口

统一的 AI 交互入口。AI 不是冰冷的工具，而是温暖的陪伴者——追问、状态、主动推送、提醒全部通过这个窗口流转。

## 消息流

```
[AI状态] 基于 soul 的个性化状态（如"小猫正在打呼噜"）
    ↓ 用户写了日记
[追问] "你说'算了'的时候，你其实希望发生什么？"（priority 1，覆盖状态）
    ↓ 用户点击窗口
[进入对话] AI 的追问作为 assistant 消息显示，等待用户输入
    ↓ 用户返回
[AI状态] 追问消失，恢复低优先级消息
    ↓ 有主动推送
[提醒] "你有3个重要待办还没安排时间"
    ↓ 用户点击
[进入对话] AI 打开对应功能（todos/briefing/summary）
```

## 消息优先级

| 优先级 | 类型 | 来源 | 点击行为 |
|--------|------|------|----------|
| 1 | reflect | process 后生成 | 追问作为 assistant 消息进入对话 |
| 2 | nudge | proactive.todo_nudge | 打开 /todos |
| 3 | briefing | proactive.morning_briefing | 打开 morning-briefing overlay |
| 4 | summary | proactive.evening_summary | 打开 evening-summary overlay |
| 10 | status | WebSocket 认证后生成 | 直接进入自由对话 |

nudge/briefing/summary 8 秒后自动降至 priority 9（不消失，降到 status 之上）。

## 文件结构

| 文件 | 作用 |
|------|------|
| `features/ai-bubble/hooks/use-ai-window.ts` | 核心状态机：消息队列 + gateway 监听 + 自动降级 |
| `features/ai-bubble/components/ai-window.tsx` | 渲染组件：Sparkles 图标 + 消息文字 + 点击路由 |
| `gateway/src/handlers/reflect.ts` | 反思追问 + AI 状态生成 |
| `gateway/skills/reflect/SKILL.md` | Reflect 技能提示词 |

## AiWindow 组件

- 位于 timeline 顶部（NotesTimeline 内部）
- status 型：`bg-secondary/30 border-secondary/40`，文字 `text-muted-foreground/60`
- 其他型：`bg-primary/5 border-primary/10`，文字 `text-foreground/80`
- 左侧 Sparkles 图标，文字 `text-sm line-clamp-4`
- 进入动画 `animate-bubble-enter`（translateY 8px → 0）

## 聊天继承机制

点击 AiWindow 进入对话时：
1. AI 的消息作为 `role: "assistant"` 显示（不是用户消息）
2. 不立即发送 `chat.start`，等用户输入
3. 用户发送第一条消息时，`chat.start` payload 携带 `assistantPreamble`（AI 原话）+ `initialMessage`（用户输入）
4. Gateway 将 `assistantPreamble` 加为 assistant 上下文，`initialMessage` 加为 user 消息

## Reflect 技能

`gateway/skills/reflect/SKILL.md`：苏格拉底追问规则
- 张力识别优先级：矛盾 > 模糊 > 情绪载荷 > 未说完 > 重复
- 格式：以"你"开头，15-30 字
- 边界：极短文本(<10字)返回 null，纯事实不追问，严重情绪先共情

`generateReflection(text, deviceId, userId?)`：加载 skill prompt + 相关记忆 → chatCompletion → 过滤 SKIP/无效

## AI 状态

`generateAiStatus(deviceId, userId?)`：
- 有 soul → AI 根据人设生成一句话状态（10-20 字，轻松俏皮）
- 无 soul → 默认状态池随机
- 触发时机：WebSocket auth 成功后自动发送

## FAB 变形

- idle：Sparkles 图标（圆形 w-16 h-16）
- recording：Mic 图标 + 脉冲环
- processing：胶囊形 `h-12 px-4`，Sparkles 旋转 + 俏皮话
- 俏皮话池：正在翻译脑电波 / 向宇宙发送电波 / 和云端小伙伴商量…
- 30s 安全超时自动重置 processing 状态

## 默认问候语

mount 时根据时段显示：
- 5-11: "早上好！新的一天，有什么计划吗？"
- 11-14: "中午好！休息一下，聊聊天？"
- 14-18: "下午好！今天进展怎么样？"
- 18-22: "晚上好！今天过得怎么样？"
- 22-5: "夜深了，有什么心事想说说吗？"

## Gateway 消息类型

```typescript
// 新增
| { type: "reflect.question"; payload: { question: string } }
| { type: "ai.status"; payload: { text: string } }

// chat.start payload 新增
assistantPreamble?: string  // AiWindow 的 AI 原话，作为 assistant 上下文
```

## CSS 动画

- `animate-bubble-enter`：opacity 0→1 + translateY 8px→0，0.3s ease-out
- `animate-bubble-fade`：opacity 0→1，0.5s ease-out
- `animate-spin-slow`：rotate 360deg，3s linear infinite
