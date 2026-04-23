---
name: AI-Native 运营系统
description: 构建自动化感知/CI/自动修复/发布管道，将创始人从执行者变为审批者
type: project
originSessionId: 728eff11-1ac5-4e89-8b3e-7f85df43991c
---
2026-04-15 启动 AI-Native 运营系统建设，分 5 个 Phase:

**Phase 1 (感知层) — 已完成代码**
- Sentry: `gateway/src/lib/sentry.ts` + `shared/lib/sentry-browser.ts` + `components/sentry-init.tsx`
- 反馈: `features/feedback/feedback-button.tsx` + `feedback-sheet.tsx` + `gateway/src/routes/feedback.ts`
- Triage Agent: `gateway/src/handlers/triage.ts` (AI 分类+去重+GitHub Issue 创建)
- GitHub 工具: `gateway/src/lib/github.ts`
- Issue 模板: `.github/ISSUE_TEMPLATE/bug-report.yml` + `feature-request.yml`

**Phase 2 (CI/CD) — 已完成代码**
- CI: `.github/workflows/ci.yml` (lint + typecheck + unit tests + pitfall lint)
- Pitfall Linter: `scripts/pitfall-lint.ts` (6 条自动检测规则)
- 前端部署: `.github/workflows/deploy-frontend.yml`

**Phase 3 (自动修复) — 已完成代码**
- Auto-fix: `.github/workflows/auto-fix.yml` (Issue → Claude Code → PR)
- PR Review: `.github/workflows/pr-review.yml` (AI 自动代码审查)

**Phase 4 (发布管道) — 已完成代码**
- OTA: `.github/workflows/release-ota.yml`
- Electron: `.github/workflows/release-electron.yml` + auto-update in `electron/main.js`
- package.json 已添加 publish 配置指向 GitHub

**Phase 5 (运营仪表盘) — 待实现**
- /ops 页面 + `gateway/src/routes/ops.ts` 端点

**待配置的环境变量/Secrets**:
- SENTRY_DSN / SENTRY_DSN_WEB
- GITHUB_TOKEN / GITHUB_REPO
- ANTHROPIC_API_KEY (GitHub Secrets)
- FRONTEND_DEPLOY_PATH (GitHub Secrets)
- ADMIN_TOKEN (for OTA release registration)

**Why:** 创始人精力无法覆盖开发+运营+反馈处理，需要自动化系统
**How to apply:** 代码已写好但需要配置外部服务（Sentry 账户、GitHub PAT、Anthropic API key）才能激活
