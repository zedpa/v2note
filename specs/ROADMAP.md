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

## Chat UI Redesign (聊天界面重构)

Spec: `specs/chat-ui-redesign.md`

- [ ] Phase 1: 顶部极简 — "路路" + AI 呼吸状态灯，去掉副标题
- [ ] Phase 2: 对话区质感 — 头像品牌色底板、非对称圆角气泡、1.6 行高
- [ ] Phase 3: 底部控制中心 — 去 N 按钮、胶囊输入框、麦克风突出、毛玻璃
- [ ] Phase 4: 滚动锁定 — 进入即锁 body，键盘不推页面

## Android 状态栏适配 (全机型兼容)

已知问题: 荣耀 Magic 7 全面屏模式下 App 内容侵入系统状态栏

根因分析:
- Android 15 (targetSdk 35) 强制启用 Edge-to-Edge，`overlaysWebView: false` 无效
- `env(safe-area-inset-top)` 在 Android WebView (Chromium <140) 中返回 0
- `.pt-safe` fallback 24px 可能不足以覆盖所有机型状态栏高度

### 方案 A: 短期修复 — opt-out Edge-to-Edge（已执行）

在 `android/app/src/main/res/values/styles.xml` 的 AppTheme.NoActionBar 中添加:
```xml
<item name="android:windowOptOutEdgeToEdgeEnforcement">true</item>
```
优点: 改动最小，一行 XML，下次打包即生效
缺点: Android 未来版本可能移除此 opt-out 开关

- [x] styles.xml 添加 windowOptOutEdgeToEdgeEnforcement
- [ ] 荣耀 Magic 7 用户验证

### 方案 B: 长期方案 — @capacitor-community/safe-area 插件

安装 `@capacitor-community/safe-area`，由原生层注入真实 `--safe-area-inset-*` CSS 变量，
全项目 CSS 从 `env(safe-area-inset-top)` 迁移到 `var(--safe-area-inset-top, 24px)`。

- [ ] 安装插件: `pnpm add @capacitor-community/safe-area && npx cap sync`
- [ ] globals.css: `.pt-safe` / `.pb-safe` 改用 `var(--safe-area-inset-top)` + fallback
- [ ] 全项目 inline `env(safe-area-inset-top)` 替换为 CSS 变量
- [ ] 移除 styles.xml 中的 opt-out（不再需要）
- [ ] 全机型测试（荣耀/OPPO/vivo/小米/三星）

## 录音功能 (暂不修复)

已知问题: 聊天界面麦克风按钮点击无反应

现状:
- `ChatView` 中的 `toggleVoice()` 使用浏览器 Web Speech API (`SpeechRecognition`)
- Android WebView 中 `SpeechRecognition` API 不可用，`hasSpeechAPI` 为 false 时按钮隐藏
- 当 `hasSpeechAPI` 意外为 true 但实际不工作时，点击无反应
- 与主录音功能（FAB → capacitor-voice-recorder）是不同的实现路径

后续方向:
- [ ] 聊天内语音输入改用 capacitor-voice-recorder + ASR（与主录音一致）
- [ ] 或集成 DashScope 实时语音识别（已有 ASR handler）

## Attachment Persistence (附件持久化)

Spec: `specs/attachment-persistence.md`

- [x] Phase 1: OSS URL + 文件名存储、timeline 图标、detail 预览
- [ ] Phase 2: 文档分块 + RAG 检索（document_chunk 表、hybridRetrieve 扩展）
- [ ] Phase 3: 检索增强（query rewriting、cross-encoder、多粒度索引）

## Fixes Completed (本轮已修复)

- [x] Daily Briefing HTTP 500: pg Date 对象 `.startsWith()` 崩溃
- [x] Chat AI 响应挂起: stream 超时保护 + chat.done 兜底
- [x] Auth 错误状态泄漏: 切换登录/注册时 clearError
- [x] 项目详情双关闭按钮: 移除重复 × 按钮
- [x] Refresh Token 竞态: 并发刷新锁
