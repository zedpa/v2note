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

SPECS_DIR="specs"
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

# 遍历所有 spec 文件（排除模板）
for spec_file in "$SPECS_DIR"/*.md; do
  # 跳过模板
  if [[ "$spec_file" == *"_template"* ]]; then
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

if [ $MISSING -gt 0 ]; then
  echo -e "${YELLOW}💡 提示：运行 Claude Code 为缺失的 spec 生成测试${NC}"
  echo "   命令示例：'根据 specs/xxx.md 生成测试文件'"
  echo ""
  exit 1
else
  echo -e "${GREEN}🎉 所有 spec 都有对应测试${NC}"
  exit 0
fi
