# gene_ai_companion — AI 伴侣窗口

> ⏸ **已删除（2026-03-29）** — 路路头像 / AiWindow / PixelDeer 全部从前后端移除。
> 聊天功能（ChatView）保留，但不再有常驻窗口和头像。
> 待产品方向确认后再设计新的 AI 交互入口。

## 已删除的文件

| 文件 | 原功能 |
|------|--------|
| `features/companion/` | ai-window、pixel-deer、use-companion、deer-states |
| `features/ai-bubble/` | 旧版 ai-window、lulu-mascot |
| `shared/lib/api/companion.ts` | DeerState 类型、API 客户端 |
| `gateway/src/companion/` | mood.ts、chat-generator.ts |
| `gateway/src/routes/companion.ts` | REST 路由 |

## 保留的相关功能

- `gateway/src/handlers/reflect.ts` — 苏格拉底追问（仍通过 WebSocket 发送 `reflect.question`，ChatView 可消费）
- `gateway/src/handlers/reflect.ts:generateAiStatus` — WebSocket 认证后发送 `ai.status`（前端暂未消费）
- `features/chat/components/chat-view.tsx` — 路路聊天界面（无头像，保留全部对话功能）

## 恢复说明

若要恢复路由头像，需要：
1. 制作 Rive 动画文件（规范见 `docs/brand/RIVE-DESIGN-SPEC.md`）
2. 重新实现 `features/companion/` 或改用 Rive 播放器
3. 在 `app/page.tsx` 和 `features/notes/components/notes-timeline.tsx` 中重新挂载
