#!/bin/bash
# ============================================================
# _lib.sh — hook 共用函数
# 使用方式：source "$(dirname "$0")/_lib.sh"
# ============================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="$REPO_ROOT/.claude/hooks"
LOG_DIR="$HOOKS_DIR/logs"
mkdir -p "$LOG_DIR"

# ----- 旁路机制 -----
# 设置 SDD_SKIP=1 跳过所有检查，并在 stderr 打印警告
sdd_skip_check() {
  if [[ "${SDD_SKIP:-0}" == "1" ]]; then
    echo "⚠️  [SDD_SKIP=1] 跳过 $(basename "$0")" >&2
    exit 0
  fi
}

# ----- 日志 -----
sdd_log() {
  local name="$1"; shift
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_DIR/${name}.log"
}

# ----- 从 stdin 读取 hook payload，提取字段（需要 jq，无 jq 时 best-effort） -----
sdd_read_payload() {
  # 缓存 stdin 到全局变量 SDD_PAYLOAD
  SDD_PAYLOAD="$(cat || true)"
  export SDD_PAYLOAD
}

sdd_payload_field() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    echo "$SDD_PAYLOAD" | jq -r "${key} // empty" 2>/dev/null || true
  else
    # 极简 fallback：只能匹配顶层 "key": "value"
    local k="${key#.}"
    echo "$SDD_PAYLOAD" | grep -oE "\"${k}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | head -1 | sed -E "s/.*\"([^\"]*)\"$/\1/" || true
  fi
}

# ----- 判断路径是否匹配 glob 列表中任意一个 -----
sdd_path_matches_any() {
  local path="$1"; shift
  for pat in "$@"; do
    # shellcheck disable=SC2053
    if [[ "$path" == $pat ]]; then
      return 0
    fi
  done
  return 1
}

# ----- 以 exit 2 阻断并把信息注入给 Claude -----
sdd_block() {
  local msg="$1"
  echo "🚫 [SDD Guard] $msg" >&2
  sdd_log "$(basename "$0" .sh)" "BLOCKED: $msg"
  exit 2
}

sdd_pass() {
  sdd_log "$(basename "$0" .sh)" "PASS: ${1:-}"
  exit 0
}
