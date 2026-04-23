#!/bin/bash
# ============================================================
# on-stop.sh — Stop hook
#
# 任务结束时的全局兜底检查：
#   1. 跑 spec-lint（规则 R1-R7）
#   2. 跑 spec-check（backport 回写检查）
#
# 不跑单元测试（太慢），测试留给 Phase 4 显式触发或 pre-commit。
#
# 任何失败 → exit 2 把 stderr 注入给 Claude，让它在结束前修复。
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

ERRORS=""

# ---- spec-lint ----
if [[ -f "$REPO_ROOT/scripts/spec-lint.ts" ]]; then
  if command -v npx >/dev/null 2>&1; then
    if ! OUT=$(cd "$REPO_ROOT" && npx -y tsx scripts/spec-lint.ts --changed 2>&1); then
      ERRORS+="📋 spec-lint 未通过：\n$OUT\n\n"
    fi
  fi
fi

# ---- spec-check ----
if [[ -f "$REPO_ROOT/scripts/spec-check.sh" ]]; then
  if ! OUT=$(cd "$REPO_ROOT" && bash scripts/spec-check.sh --backport-only 2>&1); then
    ERRORS+="📋 spec-check 未通过：\n$OUT\n\n"
  fi
fi

if [[ -n "$ERRORS" ]]; then
  sdd_block "任务结束前的流程守卫检查未通过，请修复后再结束：

$ERRORS
紧急旁路（不推荐）：SDD_SKIP=1"
fi

sdd_pass "all checks passed"
