#!/bin/bash
# APK 版本发布脚本
# 用法: ./scripts/publish-apk.sh <version> <versionCode> <download_url> "<changelog>" [gateway_url] [token]
#
# 示例: ./scripts/publish-apk.sh 2.0.0 10 "https://example.com/v2.apk" "大版本更新"

set -euo pipefail

VERSION="${1:?用法: $0 <version> <versionCode> <download_url> <changelog> [gateway_url] [token]}"
VERSION_CODE="${2:?请提供 versionCode (整数)}"
DOWNLOAD_URL="${3:?请提供 APK 下载地址}"
CHANGELOG="${4:?请提供更新说明}"
GATEWAY_URL="${5:-http://localhost:3001}"
TOKEN="${6:-$ADMIN_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "错误: 请设置 ADMIN_TOKEN 环境变量或传入第6个参数"
  exit 1
fi

echo "==> 创建 APK 发布记录..."
RELEASE=$(curl -s -X POST "${GATEWAY_URL}/api/v1/releases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"version\": \"${VERSION}\",
    \"version_code\": ${VERSION_CODE},
    \"release_type\": \"apk\",
    \"bundle_url\": \"${DOWNLOAD_URL}\",
    \"changelog\": \"${CHANGELOG}\"
  }")

echo "$RELEASE"
echo ""
echo "==> APK 发布记录创建完成! version=${VERSION}, versionCode=${VERSION_CODE}"
