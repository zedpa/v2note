#!/bin/bash
# ============================================================
# load-pitfalls.sh — PreToolUse hook
#
# 根据本次 Edit/Write 的目标文件路径，按需把 docs/pitfalls/ 下
# 对应分类的陷阱内容注入为 reminder（exit 2 + stderr）。
#
# 去重：每会话每类陷阱只注入一次，用 marker 文件（key=transcript 路径 hash）。
# ============================================================

source "$(dirname "$0")/_lib.sh"
sdd_skip_check
sdd_read_payload

FILE_PATH="$(sdd_payload_field '.tool_input.file_path')"
TRANSCRIPT_PATH="$(sdd_payload_field '.transcript_path')"

[[ -z "$FILE_PATH" ]] && sdd_pass "no file_path"

PITFALLS_DIR="$REPO_ROOT/docs/pitfalls"
[[ -d "$PITFALLS_DIR" ]] || sdd_pass "no pitfalls dir"

SESSION_ID="$(echo "${TRANSCRIPT_PATH:-unknown}" | shasum | awk '{print $1}' | cut -c1-12)"
MARKER_DIR="$LOG_DIR/.pitfall-markers"
mkdir -p "$MARKER_DIR"
# 清理 24h 以上的旧 marker
find "$MARKER_DIR" -type f -mtime +1 -delete 2>/dev/null || true

maybe_inject() {
  local tag="$1" pattern="$2" file="$PITFALLS_DIR/$tag.md"
  [[ -f "$file" ]] || return 0
  local marker="$MARKER_DIR/${SESSION_ID}-${tag}"
  [[ -f "$marker" ]] && return 0
  if [[ "$FILE_PATH" =~ $pattern ]]; then
    echo ""
    echo "[PITFALL:$tag] 本次改动匹配 $tag 分类，请遵守："
    cat "$file"
    echo ""
    touch "$marker"
    return 1  # signal: injected
  fi
  return 0
}

HAS_INJECT=0
OUTPUT=""

# 逐类检查（OUTPUT 积累到一起，最终一次 exit 2）
for entry in \
  "timezone|(tz\.ts|date-utils|toISOString|gateway/src/(handlers|lib|cognitive))" \
  "shared-components|(components/|templates\.ts|prompts/)" \
  "ai-hallucination|(gateway/src/(ai|cognitive|handlers/process|handlers/chat))" \
  "db-lock|(advisory_lock|pg_try|cognitive/wiki-compiler)" \
  "migration|(supabase/migrations/|auth|deviceId|userId)"; do

  tag="${entry%%|*}"
  pat="${entry#*|}"
  file="$PITFALLS_DIR/$tag.md"
  [[ -f "$file" ]] || continue
  marker="$MARKER_DIR/${SESSION_ID}-${tag}"
  [[ -f "$marker" ]] && continue
  if [[ "$FILE_PATH" =~ $pat ]]; then
    OUTPUT+="
[PITFALL:$tag] 本次改动匹配 $tag 分类，请遵守：
$(cat "$file")
"
    touch "$marker"
    HAS_INJECT=1
  fi
done

if [[ $HAS_INJECT -eq 1 ]]; then
  sdd_log "load-pitfalls" "INJECTED for $FILE_PATH"
  echo "$OUTPUT" >&2
  exit 2
fi

sdd_pass "no pitfall match"
