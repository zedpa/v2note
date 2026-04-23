#!/bin/bash
# ============================================================
# check-spec-read.sh — PreToolUse hook（matches: Write|Edit to features/gateway/shared/app）
#
# 约束：在修改业务代码前，当前 transcript 中必须已读过：
#   - specs/INDEX.md  或
#   - 目标文件所属 domain 的任一 spec 文件
#
# 策略（尽量宽松，避免误伤）：
#   - Agent 子代理读过也算（整个 transcript 文本 grep）
#   - 新建文件（Write 目标不存在）放行
#   - 测试文件（*.test.ts / *.spec.ts）放行
#   - 修改本会话刚刚创建的文件放行（mtime 在会话开始后）
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

FILE_PATH="$(sdd_payload_field '.tool_input.file_path')"
TRANSCRIPT_PATH="$(sdd_payload_field '.transcript_path')"

# 没拿到路径信息 → 放行（不阻断未知情况）
[[ -z "$FILE_PATH" ]] && sdd_pass "no file_path"
[[ -z "$TRANSCRIPT_PATH" ]] && sdd_pass "no transcript_path"
[[ ! -f "$TRANSCRIPT_PATH" ]] && sdd_pass "transcript not found"

# 测试文件放行（跑测试修 bug 的场景）
case "$FILE_PATH" in
  *.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*/e2e/*|*__tests__*)
    sdd_pass "test file"
    ;;
esac

# 非业务路径放行
case "$FILE_PATH" in
  */features/*|*/gateway/src/*|*/shared/*|*/app/*) ;;
  *) sdd_pass "non-business path: $FILE_PATH" ;;
esac

# transcript 中搜索是否读过 INDEX.md 或任一 spec
# transcript 是 JSONL，每行一条消息；匹配绝对或相对路径
if grep -qE '/specs/(INDEX|[a-zA-Z0-9_-]+)\.md' "$TRANSCRIPT_PATH" 2>/dev/null; then
  sdd_pass "spec read in transcript"
fi

# 没读过 → 阻断
REL="${FILE_PATH#"$REPO_ROOT/"}"
sdd_block "尝试修改 ${REL:-$FILE_PATH}，但本次会话尚未读取任何 spec 文件。
请先执行：
  1. Read tool → specs/INDEX.md
  2. 找到对应 domain 的 spec（如 todo-core.md / chat-system.md），Read 它
  3. 再回来修改代码
如果这是紧急小改动，可在终端设置 SDD_SKIP=1 后重试。"
