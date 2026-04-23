#!/bin/bash
# ============================================================
# spec-check.sh — 检查每个 spec 是否都有对应的测试文件
#
# 用法：npm run spec:check
#
# 检查项：
#   1. specs/ 目录中每个 .md 文件是否有对应的 .test.ts
#   2. 每个 spec 中的场景数 vs 测试中的 describe 数
#   3. Spec 的状态统计
# ============================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "=========================================="
echo "  📋 V2Note Spec 覆盖检查"
echo "=========================================="
echo ""

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SPECS_DIR="specs"

# 模式：--backport-only 只检查 fix 回写，跳过覆盖统计
MODE="${1:-all}"
# 测试文件可能在多个位置（features/、shared/、gateway/src/）
SEARCH_DIRS=("features" "shared" "gateway/src")
TOTAL=0
COVERED=0
MISSING=0

# 在多个目录中搜索测试文件
find_test_file() {
  local name=$1
  for dir in "${SEARCH_DIRS[@]}"; do
    local found=$(find "$dir" -name "${name}.test.ts" -o -name "${name}.test.tsx" 2>/dev/null | head -1)
    if [ -n "$found" ]; then
      echo "$found"
      return 0
    fi
  done
  return 1
}

if [ "$MODE" = "--backport-only" ]; then
  # 跳过覆盖检查，直接走 backport 部分
  COVERAGE_FAIL=0
  echo "（--backport-only 模式：跳过测试覆盖检查）"
  # 通过一个假 for 循环的替代：跳到 fix 检查
  goto_backport=1
fi

# 遍历所有 spec 文件（排除模板）
if [ "${goto_backport:-0}" != "1" ]; then
for spec_file in "$SPECS_DIR"/*.md; do
  # 跳过模板、路线图索引、归档目录
  if [[ "$spec_file" == *"_template"* ]] || [[ "$spec_file" == *"ROADMAP"* ]] || [[ "$spec_file" == *"_archive"* ]]; then
    continue
  fi

  TOTAL=$((TOTAL + 1))
  filename=$(basename "$spec_file" .md)

  # 统计 spec 中的场景数
  scenario_count=$(grep -c "^### 场景" "$spec_file" 2>/dev/null || echo "0")

  # 获取 spec 状态
  status=$(grep -o "🟡\|🔵\|✅\|🔴" "$spec_file" | head -1)

  test_file=$(find_test_file "$filename")

  if [ -n "$test_file" ]; then
    COVERED=$((COVERED + 1))
    # 统计测试中的 describe 数（粗略对应场景数）
    test_count=$(grep -c "describe(" "$test_file" 2>/dev/null || echo "0")
    # 减去顶层 describe
    test_count=$((test_count - 1))

    if [ "$test_count" -ge "$scenario_count" ]; then
      echo -e "  ${GREEN}✅${NC} $filename  ${status:-?}  场景:$scenario_count  测试组:$test_count  ($test_file)"
    else
      echo -e "  ${YELLOW}⚠️${NC}  $filename  ${status:-?}  场景:$scenario_count  测试组:$test_count (覆盖不足)  ($test_file)"
    fi
  else
    MISSING=$((MISSING + 1))
    echo -e "  ${RED}❌${NC} $filename  ${status:-?}  场景:$scenario_count  测试: 缺失!"
  fi
done

echo ""
echo "-------------------------------------------"
echo "  总计: $TOTAL 个 spec"
echo -e "  已覆盖: ${GREEN}$COVERED${NC}"
echo -e "  缺少测试: ${RED}$MISSING${NC}"
echo ""

COVERAGE_FAIL=0
if [ $MISSING -gt 0 ]; then
  echo -e "${YELLOW}💡 提示：运行 Claude Code 为缺失的 spec 生成测试${NC}"
  echo "   命令示例：'根据 specs/xxx.md 生成测试文件'"
  echo ""
  COVERAGE_FAIL=1
else
  echo -e "${GREEN}🎉 所有 spec 都有对应测试${NC}"
fi
fi # end if !goto_backport

# ============================================================
# 扩展检查 1：fix-*.md completed 必须回写主 spec
# ============================================================
echo ""
echo "=========================================="
echo "  🔁 Fix Spec 回写检查（backport）"
echo "=========================================="
echo ""

BACKPORT_FAIL=0
FIX_FILES=$(ls "$SPECS_DIR"/fix-*.md 2>/dev/null || true)

for fix in $FIX_FILES; do
  STATUS=$(grep -E '^status:' "$fix" | head -1 | sed -E 's/^status:[[:space:]]*//' | tr -d '"' | awk '{print $1}')
  [ "$STATUS" != "completed" ] && continue

  BACKPORT=$(grep -E '^backport:' "$fix" | head -1 | sed -E 's/^backport:[[:space:]]*//' | tr -d '"')
  fix_rel=$(basename "$fix")

  if [ -z "$BACKPORT" ] || [ "$BACKPORT" = "null" ] || [ "$BACKPORT" = "UNKNOWN" ]; then
    echo -e "  ${RED}❌${NC} $fix_rel  completed 但 backport 字段缺失/UNKNOWN"
    BACKPORT_FAIL=$((BACKPORT_FAIL + 1))
    continue
  fi

  # GRANDFATHERED：历史遗留，仅警告不阻断（鼓励逐步回填）
  if [ "$BACKPORT" = "GRANDFATHERED" ]; then
    echo -e "  ${YELLOW}⚠️${NC}  $fix_rel  backport=GRANDFATHERED（历史遗留，建议逐步回填到主 spec）"
    continue
  fi

  MAIN_REL="${BACKPORT%%#*}"
  MAIN_PATH="$SPECS_DIR/$MAIN_REL"
  [ -f "$MAIN_PATH" ] || MAIN_PATH="$REPO_ROOT/$MAIN_REL"
  # 兼容相对路径
  [ -f "$MAIN_PATH" ] || MAIN_PATH="$SPECS_DIR/$(basename "$MAIN_REL")"

  if [ ! -f "$MAIN_PATH" ]; then
    echo -e "  ${RED}❌${NC} $fix_rel  backport 指向 '$BACKPORT' 但找不到主 spec"
    BACKPORT_FAIL=$((BACKPORT_FAIL + 1))
    continue
  fi

  # 主 spec 存在且 backport 字段有效即视为回写契约成立。
  # 历史上的 mtime 比较会在 fix 文件二次 touch / git checkout 后假阳，
  # 因此只做存在性校验，mtime 差异已不作为阻断信号。
  echo -e "  ${GREEN}✅${NC} $fix_rel → $MAIN_REL"
done

if [ $BACKPORT_FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 所有 completed fix 均已正确回写${NC}"
fi

# ============================================================
# 最终退出码
# ============================================================
echo ""
if [ $COVERAGE_FAIL -gt 0 ] || [ $BACKPORT_FAIL -gt 0 ]; then
  echo -e "${RED}spec-check 失败（覆盖缺失:$COVERAGE_FAIL / 回写缺失:$BACKPORT_FAIL）${NC}"
  exit 1
fi
exit 0
