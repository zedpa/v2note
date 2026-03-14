#!/bin/bash
# Android 自动化构建脚本
# 用法:
#   ./scripts/build-android.sh              # Debug APK
#   ./scripts/build-android.sh release      # Release APK (需要签名配置)
#   ./scripts/build-android.sh release --install  # Release APK + 安装到设备
#
# 签名配置: 在 android/local.properties 中添加:
#   VOICENOTE_KEYSTORE_FILE=../release.jks
#   VOICENOTE_KEYSTORE_PASSWORD=your_password
#   VOICENOTE_KEY_ALIAS=release
#   VOICENOTE_KEY_PASSWORD=your_password

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

BUILD_TYPE="${1:-debug}"
INSTALL_FLAG="${2:-}"

echo "========================================="
echo "  VoiceNote Android 构建"
echo "  类型: $BUILD_TYPE"
echo "========================================="

# Step 1: 同步版本号
echo ""
echo "[1/4] 同步版本号..."
node scripts/sync-version.cjs

# Step 2: 构建前端
echo ""
echo "[2/4] 构建前端 (Next.js static export)..."
pnpm build

# Step 3: 同步到 Android
echo ""
echo "[3/4] Capacitor sync..."
npx cap sync android

# Step 4: Gradle 构建
echo ""
echo "[4/4] Gradle 构建 APK..."
cd android

# Windows 用 gradlew.bat, Unix 用 ./gradlew
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  GRADLEW="./gradlew.bat"
else
  GRADLEW="./gradlew"
fi

if [ "$BUILD_TYPE" = "release" ]; then
  $GRADLEW assembleRelease
  APK_PATH="app/build/outputs/apk/release/app-release.apk"
  if [ ! -f "$APK_PATH" ]; then
    APK_PATH="app/build/outputs/apk/release/app-release-unsigned.apk"
  fi
else
  $GRADLEW assembleDebug
  APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

cd "$ROOT_DIR"
FULL_APK_PATH="android/$APK_PATH"

if [ -f "$FULL_APK_PATH" ]; then
  echo ""
  echo "========================================="
  echo "  构建成功!"
  echo "  APK: $FULL_APK_PATH"

  # 显示文件大小
  FILE_SIZE=$(du -h "$FULL_APK_PATH" | cut -f1)
  echo "  大小: $FILE_SIZE"
  echo "========================================="

  # 可选: 安装到连接的设备
  if [ "$INSTALL_FLAG" = "--install" ]; then
    echo ""
    echo "正在安装到设备..."
    adb install -r "$FULL_APK_PATH"
    echo "安装完成!"
  fi
else
  echo ""
  echo "错误: APK 文件未找到: $FULL_APK_PATH"
  exit 1
fi
