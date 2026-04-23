#!/usr/bin/env tsx
/**
 * fix-r6-backport.ts — 给缺 backport 字段的 fix-*.md 补 GRANDFATHERED
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const files = [
  "fix-auth-error-leak.md",
  "fix-cold-resume-silent-loss.md",
  "fix-fab-over-todo-sheet.md",
  "fix-sidebar-wiki-mgmt.md",
  "fix-tab-squeeze.md",
];

for (const f of files) {
  const p = join(process.cwd(), "specs", f);
  const text = readFileSync(p, "utf-8");
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") { console.warn(`skip ${f}: no frontmatter`); continue; }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end < 0) { console.warn(`skip ${f}: no frontmatter close`); continue; }
  const newLines = [...lines.slice(0, end), "backport: GRANDFATHERED", ...lines.slice(end)];
  writeFileSync(p, newLines.join("\n"));
  console.log(`✓ ${f}`);
}
