#!/bin/bash
# 生成 Android 签名 keystore 并配置 local.properties
# 用法: ./scripts/setup-keystore.sh
#
# 只需运行一次。生成的 release.jks 不要提交到 git。

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEYSTORE_PATH="$ROOT_DIR/android/release.jks"

if [ -f "$KEYSTORE_PATH" ]; then
  echo "Keystore 已存在: $KEYSTORE_PATH"
  echo "如需重新生成，请先删除该文件。"
  exit 0
fi

echo "生成 Release Keystore..."
echo "请按提示输入信息（密码至少6位）："
echo ""

keytool -genkey -v \
  -keystore "$KEYSTORE_PATH" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -alias release

echo ""
echo "Keystore 已生成: $KEYSTORE_PATH"
echo ""

# 提示用户配置 local.properties
read -sp "请输入刚才设置的 keystore 密码: " KS_PASS
echo ""
read -sp "请输入刚才设置的 key 密码: " KEY_PASS
echo ""

LOCAL_PROPS="$ROOT_DIR/android/local.properties"

# 追加签名配置（不覆盖已有内容）
cat >> "$LOCAL_PROPS" << EOF

# Release signing config (auto-generated)
VOICENOTE_KEYSTORE_FILE=../release.jks
VOICENOTE_KEYSTORE_PASSWORD=$KS_PASS
VOICENOTE_KEY_ALIAS=release
VOICENOTE_KEY_PASSWORD=$KEY_PASS
EOF

echo ""
echo "签名配置已写入: $LOCAL_PROPS"
echo ""
echo "重要: 请确保以下文件不被提交到 git:"
echo "  - android/release.jks"
echo "  - android/local.properties"
