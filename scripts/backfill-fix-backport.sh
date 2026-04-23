#!/bin/bash
# ============================================================
# backfill-fix-backport.sh — 给历史 completed fix-*.md 注入 backport: GRANDFATHERED
#
# 仅对满足条件的文件注入：
#   - 文件名匹配 fix-*.md
#   - status: completed
#   - 当前 frontmatter 不含 backport 字段
#
# 用法：bash scripts/backfill-fix-backport.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

COUNT=0
for f in specs/fix-*.md; do
  [ -f "$f" ] || continue
  STATUS=$(awk '/^---$/{c++; next} c==1 && /^status:/{sub(/^status:[[:space:]]*/,""); gsub(/"/,""); print $1; exit}' "$f")
  [ "$STATUS" != "completed" ] && continue

  # 已有 backport 字段则跳过
  if grep -qE '^backport:' "$f"; then
    continue
  fi

  # 在 status 行下方插入 backport: GRANDFATHERED
  # macOS sed 需要空字符串作为 -i 参数
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' '/^status: completed/a\
backport: GRANDFATHERED
' "$f"
  else
    sed -i '/^status: completed/a\backport: GRANDFATHERED' "$f"
  fi
  echo "  + $f"
  COUNT=$((COUNT + 1))
done

echo ""
echo "回填 $COUNT 个文件"
