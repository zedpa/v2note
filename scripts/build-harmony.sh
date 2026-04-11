#!/usr/bin/env bash
# ============================================================
# build-harmony.sh — 构建 V2Note 并复制静态资源到鸿蒙项目
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
HARMONY_RAWFILE="$PROJECT_ROOT/harmony/entry/src/main/resources/rawfile"
OUT_DIR="$PROJECT_ROOT/out"

echo "=== V2Note HarmonyOS Build ==="
echo ""

# Step 1: 构建 Next.js 静态导出
echo "[1/3] Building Next.js static export..."
cd "$PROJECT_ROOT"
pnpm build

if [ ! -d "$OUT_DIR" ]; then
  echo "ERROR: out/ directory not found. Ensure next.config has 'output: export'."
  exit 1
fi

# Step 2: 复制 out/ 到鸿蒙 rawfile 目录
echo "[2/3] Copying static assets to harmony rawfile..."
# 先清空 rawfile（保留 .gitkeep）
find "$HARMONY_RAWFILE" -mindepth 1 -not -name '.gitkeep' -delete 2>/dev/null || true

cp -r "$OUT_DIR"/* "$HARMONY_RAWFILE/"
echo "  Copied $(find "$HARMONY_RAWFILE" -type f | wc -l) files"

# Step 3: 提示用户
echo "[3/3] Done!"
echo ""
echo "Next steps:"
echo "  1. Open 'harmony/' in DevEco Studio"
echo "  2. Build > Build Hap(s) to generate HAP package"
echo "  3. Run on emulator or device"
echo ""
echo "For release:"
echo "  1. Configure signing in build-profile.json5"
echo "  2. Build > Generate Key and CSR (if needed)"
echo "  3. Build > Build Hap(s) with release signing"
echo "  4. Upload HAP to AppGallery Connect"
