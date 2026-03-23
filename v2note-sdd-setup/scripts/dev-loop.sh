#!/bin/bash
# ============================================================
# dev-loop.sh — Spec-Driven 自动验证循环
# 
# 用法：
#   npm run verify                    # 运行所有测试
#   bash scripts/dev-loop.sh voice    # 只跑匹配 "voice" 的测试
#
# 这个脚本做的事：
#   1. 运行测试
#   2. 如果失败，输出错误摘要
#   3. 等待代码修改后自动重试
#   4. 最多重试 MAX_RETRIES 次
#   5. 全部通过后运行 lint 和 typecheck
# ============================================================

set -e

# ---- 配置 ----
MAX_RETRIES=${MAX_RETRIES:-5}
TEST_FILTER=${1:-""}           # 可选：只跑匹配的测试
RETRY=0
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "=========================================="
echo "  🔄 V2Note Spec-Driven Dev Loop"
echo "  最大重试次数: $MAX_RETRIES"
if [ -n "$TEST_FILTER" ]; then
  echo "  测试过滤: $TEST_FILTER"
fi
echo "=========================================="
echo ""

# ---- 主循环 ----
while [ $RETRY -lt $MAX_RETRIES ]; do
  RETRY=$((RETRY + 1))
  echo -e "${YELLOW}▶ 第 ${RETRY}/${MAX_RETRIES} 次尝试${NC}"
  echo "-------------------------------------------"

  # 构建测试命令
  if [ -n "$TEST_FILTER" ]; then
    TEST_CMD="npx vitest run --reporter=verbose $TEST_FILTER"
  else
    TEST_CMD="npx vitest run --reporter=verbose"
  fi

  # 运行测试，捕获输出
  set +e
  TEST_OUTPUT=$($TEST_CMD 2>&1)
  TEST_EXIT=$?
  set -e

  if [ $TEST_EXIT -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ 所有测试通过！${NC}"
    echo ""
    
    # ---- 后置检查 ----
    echo "▶ 运行 TypeScript 类型检查..."
    if npx tsc --noEmit 2>&1; then
      echo -e "${GREEN}✅ 类型检查通过${NC}"
    else
      echo -e "${YELLOW}⚠️  类型检查有警告，请检查${NC}"
    fi

    echo ""
    echo "▶ 运行 Lint 检查..."
    if npx eslint src/ --ext .ts,.tsx 2>&1; then
      echo -e "${GREEN}✅ Lint 检查通过${NC}"
    else
      echo -e "${YELLOW}⚠️  Lint 有警告，请检查${NC}"
    fi

    echo ""
    echo "=========================================="
    echo -e "${GREEN}🎉 验证完成！所有检查通过${NC}"
    echo "=========================================="
    exit 0
  fi

  # ---- 测试失败，提取关键信息 ----
  echo ""
  echo -e "${RED}❌ 测试失败${NC}"
  echo ""
  
  # 提取失败摘要（只显示 FAIL 行和 AssertionError）
  echo "📋 失败摘要："
  echo "$TEST_OUTPUT" | grep -E "(FAIL|AssertionError|Expected|Received|Error:|✕|×)" | head -20
  echo ""
  
  # 提取失败的测试名
  echo "🔍 失败的测试："
  echo "$TEST_OUTPUT" | grep -E "✕|×|FAIL" | head -10
  echo ""

  if [ $RETRY -lt $MAX_RETRIES ]; then
    echo -e "${YELLOW}💡 请修改代码，等待下一次尝试...${NC}"
    echo "   提示：错误信息已在上方，请根据 Expected/Received 修改实现"
    echo ""
    
    # 如果是 Claude Code 在运行，这里可以直接继续
    # 如果是人工运行，等待文件变化
    if [ -t 0 ]; then
      echo "   按 Enter 重试，或 Ctrl+C 退出..."
      read -r
    fi
  fi
done

# ---- 达到最大重试次数 ----
echo ""
echo "=========================================="
echo -e "${RED}💥 达到最大重试次数 ($MAX_RETRIES)${NC}"
echo "   测试仍然失败，请检查："
echo "   1. spec 定义是否有歧义"
echo "   2. 测试用例是否正确反映了 spec"
echo "   3. 是否需要人工介入调整方案"
echo "=========================================="
echo ""

# 输出最后一次的完整错误
echo "📋 最后一次完整测试输出："
echo "$TEST_OUTPUT"

exit 1
