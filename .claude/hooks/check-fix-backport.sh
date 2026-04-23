#!/bin/bash
# ============================================================
# check-fix-backport.sh — PostToolUse hook（matches: Edit to specs/fix-*.md）
#
# 约束：当 fix-*.md 被标记为 status: completed 时：
#   1. 必须有 backport 字段（指向主 spec 的路径#场景号）
#   2. 该主 spec 的 mtime 必须晚于 fix 文件的 updated（说明已回写）
#
# 触发时机：PostToolUse 看到 Edit 落地后立刻检查
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

FILE_PATH="$(sdd_payload_field '.tool_input.file_path')"

[[ -z "$FILE_PATH" ]] && sdd_pass "no file_path"

# 只对 specs/fix-*.md
case "$FILE_PATH" in
  */specs/fix-*.md) ;;
  *) sdd_pass "not fix spec" ;;
esac

[[ ! -f "$FILE_PATH" ]] && sdd_pass "file gone"

# 提取 frontmatter 字段（简单 grep，只取第一出现）
STATUS="$(grep -E '^status:' "$FILE_PATH" | head -1 | sed -E 's/^status:[[:space:]]*//' | tr -d '"' | awk '{print $1}')"
BACKPORT="$(grep -E '^backport:' "$FILE_PATH" | head -1 | sed -E 's/^backport:[[:space:]]*//' | tr -d '"')"

# 只有 status=completed 才强校验
if [[ "$STATUS" != "completed" ]]; then
  sdd_pass "status=$STATUS (not completed yet)"
fi

REL="${FILE_PATH#$REPO_ROOT/}"

# GRANDFATHERED 豁免
if [[ "$BACKPORT" == "GRANDFATHERED" ]]; then
  sdd_pass "grandfathered"
fi

# 必须有 backport 字段
if [[ -z "$BACKPORT" || "$BACKPORT" == "null" || "$BACKPORT" == "UNKNOWN" ]]; then
  sdd_block "$REL 标记为 completed，但 frontmatter 中 backport 字段缺失。
请在 frontmatter 加上：
  backport: <主 spec 路径>#场景 X.Y
（例如 backport: todo-core.md#场景 2.3）
并把本次修复新增/变更的场景同步写入该主 spec。"
fi

# 提取主 spec 路径（去掉 # 后面的片段）
MAIN_REL="${BACKPORT%%#*}"
MAIN_PATH="$REPO_ROOT/specs/$MAIN_REL"
# 允许用户写完整相对路径
[[ -f "$MAIN_PATH" ]] || MAIN_PATH="$REPO_ROOT/$MAIN_REL"

if [[ ! -f "$MAIN_PATH" ]]; then
  sdd_block "$REL 的 backport 指向 '$BACKPORT'，但找不到对应主 spec 文件。
请检查路径，例如 'todo-core.md#场景 2.3' 会被解析为 specs/todo-core.md。"
fi

# 比较 mtime：主 spec 必须不早于 fix 文件
FIX_MTIME=$(stat -f %m "$FILE_PATH" 2>/dev/null || stat -c %Y "$FILE_PATH" 2>/dev/null || echo 0)
MAIN_MTIME=$(stat -f %m "$MAIN_PATH" 2>/dev/null || stat -c %Y "$MAIN_PATH" 2>/dev/null || echo 0)

if [[ "$MAIN_MTIME" -lt "$FIX_MTIME" ]]; then
  sdd_block "$REL 标记 completed，但其 backport 指向的主 spec '$MAIN_REL' 的 mtime 早于本次 fix 修改。
说明本次修复的场景/边界条件还没回写到主 spec。
请编辑 $MAIN_REL，把 fix 中新增/变更的场景、边界同步过去。"
fi

sdd_pass "backport verified: $MAIN_REL"
