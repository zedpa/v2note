#!/bin/bash
# OTA 热更新发布脚本
# 用法: ./scripts/publish-ota.sh <version> <versionCode> "<changelog>" [gateway_url] [token]
#
# 示例: ./scripts/publish-ota.sh 1.2.0 3 "修复录音问题"

set -euo pipefail

VERSION="${1:?用法: $0 <version> <versionCode> <changelog> [gateway_url] [token]}"
VERSION_CODE="${2:?请提供 versionCode (整数)}"
CHANGELOG="${3:?请提供更新说明}"
GATEWAY_URL="${4:-http://localhost:3001}"
TOKEN="${5:-$ADMIN_TOKEN}"

if [ -z "$TOKEN" ]; then
  echo "错误: 请设置 ADMIN_TOKEN 环境变量或传入第5个参数"
  exit 1
fi

echo "==> 构建前端..."
pnpm build

echo "==> 打包 out/ 为 zip..."
BUNDLE_FILE="bundle-v${VERSION}.zip"
cd out && zip -r "../${BUNDLE_FILE}" . && cd ..

echo "==> 创建发布记录..."
RELEASE=$(curl -s -X POST "${GATEWAY_URL}/api/v1/releases" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -d "{
    \"version\": \"${VERSION}\",
    \"version_code\": ${VERSION_CODE},
    \"release_type\": \"ota\",
    \"changelog\": \"${CHANGELOG}\"
  }")

RELEASE_ID=$(echo "$RELEASE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$RELEASE_ID" ]; then
  echo "错误: 创建发布记录失败"
  echo "$RELEASE"
  exit 1
fi

echo "==> 上传 bundle (id=${RELEASE_ID})..."
curl -s -X POST "${GATEWAY_URL}/api/v1/releases/${RELEASE_ID}/upload" \
  -H "Content-Type: application/octet-stream" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-binary "@${BUNDLE_FILE}"

echo ""
echo "==> OTA 发布完成! version=${VERSION}, versionCode=${VERSION_CODE}"

# Cleanup
rm -f "${BUNDLE_FILE}"
