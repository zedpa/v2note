/**
 * 版本同步脚本
 * 读取 package.json 的 version，自动更新 android/app/build.gradle 的 versionName。
 * versionCode 需要手动管理（每次发布递增）。
 *
 * 用法: node scripts/sync-version.cjs
 */

const fs = require("fs");
const path = require("path");

const pkgPath = path.join(__dirname, "..", "package.json");
const gradlePath = path.join(__dirname, "..", "android", "app", "build.gradle");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const version = pkg.version;

if (!version) {
  console.error("无法从 package.json 读取 version");
  process.exit(1);
}

if (!fs.existsSync(gradlePath)) {
  console.log(`[sync-version] build.gradle 不存在 (${gradlePath}), 跳过`);
  process.exit(0);
}

let gradle = fs.readFileSync(gradlePath, "utf-8");

// Update versionName
const versionNameRegex = /versionName\s+"[^"]+"/;
if (versionNameRegex.test(gradle)) {
  gradle = gradle.replace(versionNameRegex, `versionName "${version}"`);
  console.log(`[sync-version] versionName => "${version}"`);
} else {
  console.warn("[sync-version] 未找到 versionName 字段");
}

// Auto-increment versionCode
const versionCodeRegex = /versionCode\s+(\d+)/;
const match = gradle.match(versionCodeRegex);
if (match) {
  const oldCode = parseInt(match[1], 10);
  const newCode = oldCode + 1;
  gradle = gradle.replace(versionCodeRegex, `versionCode ${newCode}`);
  console.log(`[sync-version] versionCode => ${newCode} (was ${oldCode})`);
} else {
  console.warn("[sync-version] 未找到 versionCode 字段");
}

fs.writeFileSync(gradlePath, gradle, "utf-8");
console.log("[sync-version] build.gradle 已更新");
