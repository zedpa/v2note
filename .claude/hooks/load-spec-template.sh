#!/bin/bash
# ============================================================
# load-spec-template.sh — PreToolUse hook（matches: Write|Edit to specs/*.md）
#
# 约束：在创建或修改 spec 文件前，如果本会话还没读过 _template.md，
#       把模板要点注入为 reminder。
# 策略：不阻断，只注入提醒（exit 2 with stderr），让 LLM 补读。
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

FILE_PATH="$(sdd_payload_field '.tool_input.file_path')"
TRANSCRIPT_PATH="$(sdd_payload_field '.transcript_path')"

[[ -z "$FILE_PATH" ]] && sdd_pass "no file_path"

# 只对 specs/*.md（不含 _archive、INDEX、buglog）
case "$FILE_PATH" in
  */specs/INDEX.md|*/specs/buglog.md|*/specs/_archive/*|*/specs/_template.md)
    sdd_pass "meta spec file"
    ;;
  */specs/*.md) ;;
  *) sdd_pass "not spec file" ;;
esac

# 本会话已读过 _template.md → 放行
if [[ -f "$TRANSCRIPT_PATH" ]] && grep -qE '/specs/_template\.md' "$TRANSCRIPT_PATH" 2>/dev/null; then
  sdd_pass "template read in session"
fi

# 注入提醒
sdd_block "即将写 spec 文件 ${FILE_PATH#$REPO_ROOT/}，但本会话尚未读取 specs/_template.md。
关键约束（模板中详述）：
- Given/When/Then 必须从用户视角写，When 以用户动作开头（点击/输入/打开/说 等）
- Then 禁止出现实现词（调用/函数/API/数据库/setState/dispatch）
- 每个场景必须有「用户可见结果」
- fix-*.md 的 frontmatter 必须包含 backport 字段（指向主 spec 的场景号）
请先 Read specs/_template.md，再来写这个 spec。"
