## gene_proactive_ai
### 功能描述
AI 主动提醒。通过 WebSocket 推送 toast 通知，基于影响力评分智能提醒用户管理待办。AI 可执行项提供协助建议。支持 BullMQ（Redis）持久化调度，无 Redis 时优雅降级为 setInterval。

### 详细功能
- 功能1：ProactiveEngine 定期检查已连接设备的待办状态
- 功能2：检测未安排时间的待办 → 提醒安排
- 功能3：检测超时待办 → 仅 impact >= 4 的项触发提醒，按 impact 降序排列
- 功能4：WebSocket 消息类型：proactive.message / proactive.todo_nudge / proactive.morning_briefing / proactive.evening_summary（含 ai_actionable 标识）
- 功能5：前端 NudgeToastListener 监听并显示 toast
- 功能6：toast 支持快捷操作按钮
- 功能7：ai_actionable 超时项提示"要不要让AI帮你处理？"
- ~~功能 companion.chat~~：每日问候/完成奖励推送已删除（2026-03-29，随路路头像一起移除）
- 功能8：**BullMQ 持久化调度** — 动态 import("bullmq") 避免硬依赖，plain connection config `{ host, port, password }` 避免 ioredis 版本冲突
- 功能9：**精确 cron 调度** — upsertJobScheduler 注册 per-device 定时任务（7:30 晨间简报 / 14:00 转达提醒 / 20:00 日终总结），idempotent 重启安全
- 功能10：**优雅降级** — start() 先 try BullMQ，catch 后 startFallbackTimer()；fallback 模式保留原时段检查逻辑+dailyPushSent 去重
- 功能11：**重试与清理** — 默认 3 次指数退避重试，保留最近 100 条完成/500 条失败记录

### 关键文件
- `gateway/src/proactive/engine.ts` — 推送引擎（BullMQ + fallback + impact 过滤 + ai_actionable 提示）
- `features/proactive/components/nudge-toast.tsx` — toast 监听组件

### 测试描述
- 输入：创建无时间待办 → 等待 30 分钟
- 输出：收到 toast 提醒 "你有 N 项待办还没有安排时间"
- 输入：AI可协助的高影响力待办超时
- 输出：toast 显示"要不要让AI帮你处理？"
