#!/usr/bin/env node
/**
 * APK 发布脚本（直连数据库，无需 admin token）
 *
 * 用法:
 *   node scripts/release-apk.mjs <apk文件路径> [更新说明]
 *
 * 示例:
 *   node scripts/release-apk.mjs android/app/build/outputs/apk/debug/app-debug.apk "新增附件预览"
 *   node scripts/release-apk.mjs ./v2note.apk                  # 更新说明默认从 git log 取
 *
 * 执行流程:
 *   1. 读取 package.json 版本号 + build.gradle versionCode
 *   2. 上传 APK 到 OSS (releases/v2note-{version}.apk)
 *   3. 写入 app_release 表
 *
 * 环境变量（读取 gateway/.env）:
 *   OSS_REGION, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET, OSS_BUCKET
 *   RDS_HOST, RDS_DATABASE, RDS_USER, RDS_PASSWORD, RDS_PORT, RDS_SSL
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import OSS from "ali-oss";
import { config } from "dotenv";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── 加载 gateway/.env ──
config({ path: join(ROOT, "gateway", ".env") });

// ── 参数解析 ──
const apkPath = process.argv[2];
let changelog = process.argv[3];

if (!apkPath) {
  console.error("用法: node scripts/release-apk.mjs <apk路径> [更新说明]");
  console.error("示例: node scripts/release-apk.mjs android/app/build/outputs/apk/debug/app-debug.apk");
  process.exit(1);
}

const fullApkPath = resolve(ROOT, apkPath);
if (!existsSync(fullApkPath)) {
  console.error(`错误: APK 文件不存在: ${fullApkPath}`);
  process.exit(1);
}

// ── 读取版本信息 ──
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const version = pkg.version;

// 从 build.gradle 读取 versionCode
const gradlePath = join(ROOT, "android", "app", "build.gradle");
let versionCode = 1;
if (existsSync(gradlePath)) {
  const gradle = readFileSync(gradlePath, "utf-8");
  const match = gradle.match(/versionCode\s+(\d+)/);
  if (match) versionCode = parseInt(match[1], 10);
}

// 默认更新说明：取最近一条 git commit message
if (!changelog) {
  try {
    changelog = execSync("git log -1 --format=%s", { cwd: ROOT, encoding: "utf-8" }).trim();
  } catch {
    changelog = `v${version} 更新`;
  }
}

const apkStat = statSync(fullApkPath);
const apkBuf = readFileSync(fullApkPath);
const checksum = createHash("sha256").update(apkBuf).digest("hex");

console.log("=========================================");
console.log("  念念有路 APK 发布");
console.log(`  版本: ${version} (versionCode: ${versionCode})`);
console.log(`  APK:  ${fullApkPath}`);
console.log(`  大小: ${(apkStat.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`  说明: ${changelog}`);
console.log("=========================================");
console.log();

// ── Step 1: 上传到 OSS ──
console.log("[1/2] 上传 APK 到 OSS...");

const ossClient = new OSS({
  region: process.env.OSS_REGION?.startsWith("oss-")
    ? process.env.OSS_REGION
    : `oss-${process.env.OSS_REGION}`,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

const ossKey = `releases/v2note-${version}-${versionCode}.apk`;
const ossResult = await ossClient.put(ossKey, apkBuf);
const downloadUrl = ossResult.url;

console.log(`  ✓ 上传成功: ${downloadUrl}`);
console.log();

// ── Step 2: 写入数据库 ──
console.log("[2/2] 写入发布记录到数据库...");

const pool = new pg.Pool({
  host: process.env.RDS_HOST,
  port: parseInt(process.env.RDS_PORT ?? "5432", 10),
  database: process.env.RDS_DATABASE,
  user: process.env.RDS_USER,
  password: process.env.RDS_PASSWORD,
  ssl: process.env.RDS_SSL === "true" ? { rejectUnauthorized: false } : false,
});

// 将同版本的旧记录标记为非活跃
await pool.query(
  `UPDATE app_release SET is_active = false WHERE platform = 'android' AND release_type = 'apk' AND version = $1`,
  [version],
);

const { rows } = await pool.query(
  `INSERT INTO app_release (version, version_code, platform, release_type, bundle_url, file_size, checksum, changelog, is_mandatory, is_active)
   VALUES ($1, $2, 'android', 'apk', $3, $4, $5, $6, false, true)
   RETURNING id, version, version_code`,
  [version, versionCode, downloadUrl, apkStat.size, checksum, changelog],
);

await pool.end();

console.log(`  ✓ 发布记录已创建: id=${rows[0].id}`);
console.log();
console.log("=========================================");
console.log("  发布完成!");
console.log(`  版本: v${version} (code: ${versionCode})`);
console.log(`  下载: ${downloadUrl}`);
console.log(`  用户打开 App 将自动收到更新提示`);
console.log("=========================================");
