#!/bin/bash
# ============================================================
# sdd-gate.sh — pre-commit 兜底检查
#
# 在 git commit 前运行，阻止违反 SDD 流程的提交。
#
# 检查项（仅针对 staged 文件）：
#   G1. 业务实现 diff（features/ gateway/src/ 非 test）必须有对应 e2e/*.spec.ts
#       存在（仓库中任意，不限本次提交）
#   G2. fix-*.md 标为 completed → 必须同提交 touch backport 指向的主 spec
#   G3. 改动到的 specs/*.md 必须通过 spec-lint
#
# 旁路：
#   SDD_SKIP=1                   跳过所有
#   git commit --no-verify      跳过 pre-commit
# ============================================================

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

if [[ "${SDD_SKIP:-0}" == "1" ]]; then
  echo "⚠️  [SDD_SKIP=1] 跳过 sdd-gate"
  exit 0
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

STAGED=$(git diff --cached --name-only --diff-filter=ACMR)
[[ -z "$STAGED" ]] && { echo "无 staged 文件，跳过"; exit 0; }

FAIL=0

# ============ G1. 业务实现 → E2E 必须存在 ============
BIZ_IMPL=$(echo "$STAGED" | grep -E '^(features/|gateway/src/)' | grep -vE '\.(test|spec)\.' || true)
if [[ -n "$BIZ_IMPL" ]]; then
  if ! find e2e -name "*.spec.ts" -type f 2>/dev/null | head -1 | grep -q .; then
    echo -e "${RED}✗ G1${NC} 本次提交含业务实现但 e2e/ 目录没有任何 *.spec.ts"
    echo "     文件：$(echo "$BIZ_IMPL" | head -3 | tr '\n' ' ')..."
    FAIL=$((FAIL + 1))
  fi
fi

# ============ G2. fix-*.md completed → 主 spec 必须同 commit touch ============
FIX_STAGED=$(echo "$STAGED" | grep -E '^specs/fix-.*\.md$' || true)
if [[ -n "$FIX_STAGED" ]]; then
  for fix in $FIX_STAGED; do
    [[ -f "$fix" ]] || continue
    STATUS=$(awk '/^---$/{c++; next} c==1 && /^status:/{sub(/^status:[[:space:]]*/,""); gsub(/"/,""); print $1; exit}' "$fix")
    [[ "$STATUS" != "completed" ]] && continue

    BACKPORT=$(grep -E '^backport:' "$fix" | head -1 | sed -E 's/^backport:[[:space:]]*//' | tr -d '"')
    [[ "$BACKPORT" == "GRANDFATHERED" ]] && continue

    if [[ -z "$BACKPORT" || "$BACKPORT" == "null" || "$BACKPORT" == "UNKNOWN" ]]; then
      echo -e "${RED}✗ G2${NC} $fix 为 completed 但缺 backport 字段"
      FAIL=$((FAIL + 1))
      continue
    fi

    MAIN_REL="${BACKPORT%%#*}"
    MAIN_PATH="specs/$MAIN_REL"
    [[ -f "$MAIN_PATH" ]] || MAIN_PATH="$MAIN_REL"

    if [[ ! -f "$MAIN_PATH" ]]; then
      echo -e "${RED}✗ G2${NC} $fix backport 指向 '$BACKPORT' 但找不到主 spec"
      FAIL=$((FAIL + 1))
      continue
    fi

    if ! echo "$STAGED" | grep -qx "$MAIN_PATH"; then
      echo -e "${RED}✗ G2${NC} $fix 为 completed，但本次提交未同步修改主 spec '$MAIN_PATH'"
      echo "       请把 fix 中新增/变更的场景、边界同步到主 spec，再 git add $MAIN_PATH"
      FAIL=$((FAIL + 1))
    fi
  done
fi

# ============ G3. spec-lint（仅 staged 的 spec） ============
SPEC_STAGED=$(echo "$STAGED" | grep -E '^specs/.*\.md$' | grep -v '^specs/_archive/' || true)
if [[ -n "$SPEC_STAGED" ]]; then
  if command -v npx >/dev/null 2>&1; then
    # shellcheck disable=SC2086
    if ! OUT=$(npx -y tsx scripts/spec-lint.ts $SPEC_STAGED 2>&1); then
      echo -e "${RED}✗ G3${NC} spec-lint 未通过："
      echo "$OUT" | sed 's/^/       /'
      FAIL=$((FAIL + 1))
    fi
  fi
fi

echo ""
if [[ $FAIL -gt 0 ]]; then
  echo -e "${RED}sdd-gate 阻断提交（$FAIL 项违规）${NC}"
  echo "紧急旁路：SDD_SKIP=1 git commit ... 或 git commit --no-verify"
  exit 1
fi

echo -e "${GREEN}✓ sdd-gate 通过${NC}"
exit 0
