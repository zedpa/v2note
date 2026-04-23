#!/usr/bin/env tsx
/**
 * fix-r1-full.ts — 为缺少多字段的 spec 文件补齐 frontmatter
 * 使用占位值，用户后续可修正
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const SPECS = join(process.cwd(), "specs");
const TODAY = "2026-04-17";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === "_archive") continue;
      walk(p, out);
    } else if (e.endsWith(".md")) out.push(p);
  }
  return out;
}

const REQUIRED = ["id", "status", "domain", "risk", "created", "updated"];

function parseFrontmatter(text: string) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { fm: {} as Record<string, string>, endLine: -1, lines };
  const fm: Record<string, string> = {};
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
    const m = lines[i].match(/^([a-z_]+):\s*(.*)$/i);
    if (m) fm[m[1]] = m[2].trim();
  }
  return { fm, endLine: end, lines };
}

// 从文件名推断 domain
function inferDomain(fname: string): string {
  const name = fname.replace(/^fix-/, "").replace(/\.md$/, "");
  if (/^auth/.test(name)) return "auth";
  if (/^chat/.test(name)) return "chat";
  if (/^cold-start|^onboarding/.test(name)) return "onboarding";
  if (/^todo|^smart-todo/.test(name)) return "todo";
  if (/^voice/.test(name)) return "voice";
  if (/^cognitive/.test(name)) return "cognitive";
  if (/^daily|^cognitive-report|^unified-daily/.test(name)) return "report";
  if (/^goal/.test(name)) return "goal";
  if (/^header|^ui|^design/.test(name)) return "ui";
  if (/^device|^fix-device/.test(name)) return "device";
  if (/^decision/.test(name)) return "meta";
  if (/^agent/.test(name)) return "agent";
  return "misc";
}

// 占位 id，按文件名 hash 生成
function placeholderId(fname: string): string {
  // 使用简单递增号 + 前缀避免冲突
  const base = basename(fname, ".md").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return base;
}

let fixed = 0;
for (const file of walk(SPECS)) {
  const text = readFileSync(file, "utf-8");
  const { fm, endLine, lines } = parseFrontmatter(text);
  if (endLine < 0) continue; // 无 frontmatter 跳过（另处理）
  const missing = REQUIRED.filter((k) => !(k in fm));
  if (missing.length === 0) continue;
  // 只处理缺多个字段的（缺单个 risk 由另一个脚本处理）
  if (missing.length === 1 && missing[0] === "risk") continue;

  const fname = basename(file);
  // 构造新字段
  const adds: string[] = [];
  if (missing.includes("id")) adds.push(`id: "${placeholderId(fname)}"`);
  if (missing.includes("status")) adds.push(`status: draft`);
  if (missing.includes("domain")) adds.push(`domain: ${inferDomain(fname)}`);
  if (missing.includes("risk")) adds.push(`risk: medium`);
  if (missing.includes("created")) adds.push(`created: ${TODAY}`);
  if (missing.includes("updated")) adds.push(`updated: ${TODAY}`);

  // 插入到 frontmatter 闭合之前
  const newLines = [...lines.slice(0, endLine), ...adds, ...lines.slice(endLine)];
  writeFileSync(file, newLines.join("\n"));
  fixed++;
  console.log(`✓ ${file.replace(process.cwd() + "/", "")} (补 ${missing.join(",")})`);
}
console.log(`\nfixed: ${fixed}`);
