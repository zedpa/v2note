# V2Note Roadmap

> 最后更新：2026-04-03

## Auth Hardening

Spec: `specs/auth-hardening.md`

- [x] Phase 1: Refresh Token 竞态锁 + Token 过期延长 (access 2h / refresh 30d)
- [x] Phase 2: 登录/注册 UX 强化（记住账号、自动登录、密码强度、错误提示优化）
- [ ] Phase 3: 注册事务保护 — createUser + linkDevice + issueTokens 原子化，失败回滚
- [ ] Phase 4: 短信验证码、忘记密码/重置密码、多设备管理

## Unified Daily Report (统一日报系统)

Spec: `specs/unified-daily-report.md`

- [x] Phase 1: 合并早晚报 + Prompt 外置 + 统一 API (`/api/v1/report?mode=auto`)
  - 前端 SmartDailyReport 组件、侧边栏合并为单一"日报"入口
  - Soul 自适应语气、视角轮换（晚间）、prompt 模板 (.md)
- [ ] Phase 2: 周报 + 月报 + 历史存档
  - weekly/monthly handler 实现
  - daily_briefing 表加 user_id 列 + 新 type 支持
  - 历史报告查询 API + 前端页面
  - 周报定时触发（每周日 20:00）、月报定时触发（每月1日 09:00）
- [ ] Phase 3: 增强
  - 晚间注入用户今日原始记录 (record.transcript) 供 AI 引用
  - 周报引用晚间 cognitive_highlights
  - 月报引用周报 top_moments
  - 报告质量校验（headline 长度、引用检查）

## Todo UI Redesign (待办重构)

- [ ] 双视图：今日卡片 + 项目卡片
- [ ] 新设计稿驱动（详见 memory: project_todo_redesign.md）

## Fixes Completed (本轮已修复)

- [x] Daily Briefing HTTP 500: pg Date 对象 `.startsWith()` 崩溃
- [x] Chat AI 响应挂起: stream 超时保护 + chat.done 兜底
- [x] Auth 错误状态泄漏: 切换登录/注册时 clearError
- [x] 项目详情双关闭按钮: 移除重复 × 按钮
- [x] Refresh Token 竞态: 并发刷新锁
