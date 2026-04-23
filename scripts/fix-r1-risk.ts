#!/usr/bin/env tsx
/**
 * fix-r1-risk.ts — 批量补齐 frontmatter 的 risk 字段
 *
 * 仅针对"只缺 risk"的 spec；缺多个字段的 spec 不动（另行处理）
 * 统一用 risk: medium 作为默认值
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SPECS = join(process.cwd(), "specs");

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

let fixed = 0;
let skipped = 0;
for (const file of walk(SPECS)) {
  const text = readFileSync(file, "utf-8");
  const { fm, endLine, lines } = parseFrontmatter(text);
  if (endLine < 0) { skipped++; continue; }
  const missing = REQUIRED.filter((k) => !(k in fm));
  // 只处理"只缺 risk"的
  if (missing.length !== 1 || missing[0] !== "risk") continue;
  // 在 domain 行之后插入 risk: medium
  let insertAt = endLine; // before closing ---
  for (let i = 1; i < endLine; i++) {
    if (/^domain:/.test(lines[i])) { insertAt = i + 1; break; }
  }
  const newLines = [...lines.slice(0, insertAt), "risk: medium", ...lines.slice(insertAt)];
  writeFileSync(file, newLines.join("\n"));
  fixed++;
  console.log(`✓ ${file.replace(process.cwd() + "/", "")}`);
}
console.log(`\nfixed: ${fixed}, skipped (no frontmatter): ${skipped}`);
