/**
 * flomo 导出 HTML → v2note 导入脚本
 *
 * 用法: node scripts/import-flomo.mjs <path-to-v2note.html>
 *
 * 流程:
 *  1. 登录获取 JWT access token
 *  2. 解析 HTML 提取 memo (时间 + 正文)
 *  3. 按时间从旧到新逐条 POST /api/v1/ingest (type=text)
 *  4. 每条间隔 500ms，避免服务压力过大
 */

import { readFileSync } from "fs";
import { JSDOM } from "jsdom";

const GW = process.env.GW_URL || "http://localhost:3001";
const PHONE = process.env.PHONE || "18793198472";
const PASSWORD = process.env.PASSWORD || "718293";
const DEVICE_IDENTIFIER = "flomo-import-script";
const DELAY_MS = 800; // 每条间隔

let DEVICE_ID = ""; // 真实 UUID，注册后获得

// ── 0. Register device ──
async function registerDevice() {
  const res = await fetch(`${GW}/api/v1/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: DEVICE_IDENTIFIER, platform: "script" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Device register failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  DEVICE_ID = data.id;
  console.log(`📱 设备注册: id=${DEVICE_ID}`);
}

// ── 1. Login ──
async function login() {
  const res = await fetch(`${GW}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD, deviceId: DEVICE_ID }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  console.log(`✅ 登录成功: userId=${data.user.id}`);
  return data.accessToken;
}

// ── 2. Parse HTML ──
function parseMemos(htmlPath) {
  const html = readFileSync(htmlPath, "utf-8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const memoEls = doc.querySelectorAll(".memo");

  const memos = [];
  for (const el of memoEls) {
    const timeEl = el.querySelector(".time");
    const contentEl = el.querySelector(".content");
    if (!timeEl || !contentEl) continue;

    const time = timeEl.textContent.trim();

    // 提取纯文本，保留段落分隔
    const paragraphs = contentEl.querySelectorAll("p");
    let text = "";
    if (paragraphs.length > 0) {
      text = Array.from(paragraphs)
        .map(p => p.textContent.trim())
        .filter(t => t.length > 0)
        .join("\n\n");
    } else {
      text = contentEl.textContent.trim();
    }

    if (!text) continue;

    memos.push({ time, text });
  }

  // 按时间从旧到新排序
  memos.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

  return memos;
}

// ── 3. Ingest ──
async function ingestMemo(token, memo, index, total) {
  const res = await fetch(`${GW}/api/v1/ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Device-Id": DEVICE_ID,
    },
    body: JSON.stringify({
      type: "text",
      content: memo.text,
      source_type: "think",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`  ❌ [${index + 1}/${total}] ${memo.time} — 失败: ${err}`);
    return false;
  }

  const data = await res.json();
  console.log(`  ✅ [${index + 1}/${total}] ${memo.time} → recordId=${data.recordId}`);
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ──
async function main() {
  const htmlPath = process.argv[2];
  if (!htmlPath) {
    console.error("用法: node scripts/import-flomo.mjs <path-to-v2note.html>");
    process.exit(1);
  }

  console.log(`📄 解析 HTML: ${htmlPath}`);
  const memos = parseMemos(htmlPath);
  console.log(`📝 共 ${memos.length} 条 memo，时间范围: ${memos[0]?.time} ~ ${memos[memos.length - 1]?.time}\n`);

  console.log("📱 注册设备...");
  await registerDevice();

  console.log("🔐 登录中...");
  const token = await login();

  console.log(`\n📤 开始导入 ${memos.length} 条记录...\n`);

  let success = 0;
  let fail = 0;

  for (let i = 0; i < memos.length; i++) {
    const ok = await ingestMemo(token, memos[i], i, memos.length);
    if (ok) success++; else fail++;

    // 避免压力过大
    if (i < memos.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n🏁 导入完成: ${success} 成功, ${fail} 失败, 共 ${memos.length} 条`);
  console.log("⏳ Digest 后台处理中... 请等待约 2-5 分钟让 AI 完成 Strike 分解和聚类");
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
