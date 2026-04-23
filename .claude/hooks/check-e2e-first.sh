#!/bin/bash
# ============================================================
# check-e2e-first.sh — PreToolUse hook（matches: Write|Edit to features/gateway/src）
#
# 约束：在修改业务实现前，本会话中必须已经：
#   - 创建或读取过任一 e2e/*.spec.ts 文件   或
#   - 目标模块已有对应 e2e 测试存在
#
# 策略：
#   - 测试文件本身放行
#   - 仅涉及样式/文案的小改动无法判断，此 hook 采取宽松策略：只要 e2e/ 目录下存在任一 .spec.ts 即放行
#   - 真正想硬约束 E2E-first 的是"新功能首次实现时"，由 sdd-gate.sh 在 pre-commit 兜底
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

FILE_PATH="$(sdd_payload_field '.tool_input.file_path')"
TRANSCRIPT_PATH="$(sdd_payload_field '.transcript_path')"

[[ -z "$FILE_PATH" ]] && sdd_pass "no file_path"

# 测试文件/E2E 文件本身放行
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*/e2e/*|*__tests__*)
    sdd_pass "test file"
    ;;
esac

# 仅业务实现路径才检查
case "$FILE_PATH" in
  */features/*|*/gateway/src/*) ;;
  *) sdd_pass "not business impl" ;;
esac

# e2e/ 目录下任一 spec 存在即放行
if find "$REPO_ROOT/e2e" -name "*.spec.ts" -type f 2>/dev/null | head -1 | grep -q .; then
  # 进一步检查本会话是否触及过 e2e（宽松检查）
  if [[ -f "$TRANSCRIPT_PATH" ]] && grep -qE '/e2e/[^"]+\.spec\.ts' "$TRANSCRIPT_PATH" 2>/dev/null; then
    sdd_pass "session touched e2e"
  fi
  # 有 e2e 目录但本会话没碰过 → 提示但不阻断（软约束）
  sdd_log "check-e2e-first" "WARN: $FILE_PATH edited without touching e2e in session"
  sdd_pass "e2e dir exists (warn)"
fi

# 整个仓库都没 e2e → 阻断
REL="${FILE_PATH#$REPO_ROOT/}"
sdd_block "尝试修改业务实现 $REL，但仓库 e2e/ 目录下没有任何 *.spec.ts。
按 CLAUDE.md Phase 2a：E2E 验收测试必须先于实现代码生成。
请先在 e2e/ 下创建对应的 *.spec.ts（描述用户可见的操作和结果），再来写实现。
紧急旁路：SDD_SKIP=1"
