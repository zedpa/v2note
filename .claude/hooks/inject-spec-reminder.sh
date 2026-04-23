#!/bin/bash
# ============================================================
# inject-spec-reminder.sh — UserPromptSubmit hook
#
# 当用户输入包含「修改/新功能/bug/实现/添加/feature/fix」等关键词时，
# 在上下文中注入提醒：先读 specs/INDEX.md，遵循 SDD 流程。
#
# Claude Code UserPromptSubmit hook：stdout 会被作为上下文注入。
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

PROMPT="$(sdd_payload_field '.prompt')"

# 关键词命中（中英文混合）
if echo "$PROMPT" | grep -qiE "(修改|新功能|bug|实现|添加|改个|加个|重构|修复|feature|fix|refactor|implement|add )" 2>/dev/null; then
  cat <<'EOF'
📋 [SDD Reminder] 本次任务涉及功能变更或 bug 修复，按 CLAUDE.md 的 SDD 流程执行：
1. 先用 Read 工具读取 `specs/INDEX.md`，按 domain 查找现有 spec
2. 如需修改现有行为 → 读对应 domain 的 spec
3. 如是 bug 修复 → 创建 `specs/fix-<简述>.md`（frontmatter 必须含 `backport: <主 spec 路径>#场景 X`）
4. E2E 测试（`e2e/*.spec.ts`）必须在实现代码之前生成
5. 实现阶段禁止修改 E2E 测试
EOF
  sdd_log "inject-spec-reminder" "INJECTED: prompt=$(echo "$PROMPT" | head -c 80)"
fi

exit 0
