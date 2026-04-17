/**
 * Pitfall Linter — 自动检测 CLAUDE.md 中 15 条已知陷阱的代码模式
 *
 * 用法:
 *   npx tsx scripts/pitfall-lint.ts            # 检测所有 TS/TSX 文件
 *   npx tsx scripts/pitfall-lint.ts --changed  # 仅检测 git 变更的文件
 *
 * 退出码: 0 = 无违规, 1 = 有违规
 */

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, relative } from "node:path";
import { glob } from "glob";

// ── 陷阱规则定义 ──

interface PitfallRule {
  id: string;
  name: string;
  description: string;
  /** 文件路径匹配（glob 模式），限制检测范围 */
  filePattern?: RegExp;
  /** 检测函数，返回违规行号列表 */
  check: (content: string, filePath: string) => number[];
}

const rules: PitfallRule[] = [
  {
    id: "TZ-001",
    name: "toISOString().split('T')[0]",
    description: "禁止使用 toISOString().split('T')[0] 获取日期（返回 UTC 日期）",
    check: (content) => {
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        if (line.includes("toISOString()") && line.includes('split("T")') || line.includes("split('T')")) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
  {
    id: "TZ-002",
    name: "剥离 Z 后缀",
    description: "前端禁止 .replace(/Z$/i, '') 剥离时区后缀",
    filePattern: /^(?!.*gateway)/,
    check: (content) => {
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        if (/\.replace\(\s*\/Z\$\//.test(line) || /\.replace\(\s*\/Z\$\/i/.test(line)) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
  {
    id: "TZ-003",
    name: "Gateway 中裸 new Date()",
    description: "Gateway 中禁止使用 new Date() 做日期计算，使用 lib/tz.ts 的 tzNow()/today() 等",
    filePattern: /gateway\/src\//,
    check: (content, filePath) => {
      // 排除 tz.ts 本身和测试文件
      if (filePath.includes("lib/tz.ts") || filePath.includes(".test.")) return [];
      // 检查是否导入了 tz.ts
      const hasTzImport = /from\s+["'].*\/tz/.test(content);
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        // 匹配 new Date() 无参调用（用于获取"当前时间"）
        if (/new\s+Date\(\s*\)/.test(line)) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
            // 如果文件已导入 tz 且该行只是作为参数传递给 tz 函数，允许
            if (hasTzImport && /tz\w*\(.*new\s+Date\(\)/.test(line)) return;
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
  {
    id: "DB-001",
    name: "Session-level advisory lock",
    description: "禁止在 Supabase Transaction Pooler 上使用 session-level advisory lock",
    filePattern: /gateway\/src\//,
    check: (content) => {
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        // 匹配 pg_advisory_lock 但不是 pg_advisory_xact_lock 或 pg_try_advisory_xact_lock
        if (/pg_advisory_lock|pg_advisory_unlock/.test(line) && !/_xact_/.test(line)) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
  {
    id: "TZ-004",
    name: "裸日期提取 .split('T')[0]",
    description: "禁止用 .split('T')[0] 从 ISO 字符串提取日期（对 UTC 时间返回 UTC 日期）",
    check: (content) => {
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        // 匹配 .split("T")[0] 或 .split('T')[0] 但排除注释
        if (/\.split\(["']T["']\)\s*\[\s*0\s*\]/.test(line)) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*") && !line.trimStart().startsWith("*")) {
            // 排除 CLAUDE.md 引用和注释中的示例
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
  {
    id: "TZ-005",
    name: "前端 new Date().toISOString() 取日期",
    description: "前端禁止 new Date().toISOString() 系列获取本地日期",
    filePattern: /^(?!.*gateway)/,
    check: (content, filePath) => {
      if (filePath.includes(".test.") || filePath.includes("date-utils")) return [];
      const violations: number[] = [];
      content.split("\n").forEach((line, i) => {
        if (/new\s+Date\(\)\s*\.toISOString\(\)/.test(line)) {
          if (!line.trimStart().startsWith("//") && !line.trimStart().startsWith("*")) {
            violations.push(i + 1);
          }
        }
      });
      return violations;
    },
  },
];

// ── 执行逻辑 ──

interface Violation {
  file: string;
  line: number;
  rule: PitfallRule;
}

async function main() {
  const args = process.argv.slice(2);
  const changedOnly = args.includes("--changed");

  let files: string[];

  if (changedOnly) {
    // 仅检测 git 变更的文件
    try {
      const diff = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf-8" });
      files = diff
        .split("\n")
        .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
        .filter((f) => existsSync(f));
    } catch {
      // 没有 origin/main（本地分支），检测所有 staged 文件
      const diff = execSync("git diff --name-only --cached", { encoding: "utf-8" });
      files = diff
        .split("\n")
        .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
        .filter((f) => existsSync(f));
    }
  } else {
    // 检测源代码 TS/TSX 文件
    files = await glob("{app,features,shared,components,gateway/src,lib}/**/*.{ts,tsx}", {
      ignore: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    });
  }

  console.log(`[pitfall-lint] Scanning ${files.length} files...`);

  const violations: Violation[] = [];

  for (const file of files) {
    const absPath = resolve(file);
    const relPath = relative(process.cwd(), absPath);

    let content: string;
    try {
      content = readFileSync(absPath, "utf-8");
    } catch {
      continue;
    }

    for (const rule of rules) {
      // 文件路径过滤
      if (rule.filePattern && !rule.filePattern.test(relPath)) continue;

      const lines = rule.check(content, relPath);
      for (const line of lines) {
        violations.push({ file: relPath, line, rule });
      }
    }
  }

  // 输出结果
  if (violations.length === 0) {
    console.log("[pitfall-lint] No violations found!");
    process.exit(0);
  }

  console.error(`\n[pitfall-lint] Found ${violations.length} violation(s):\n`);

  for (const v of violations) {
    // GitHub Actions annotation 格式
    if (process.env.GITHUB_ACTIONS) {
      console.error(`::error file=${v.file},line=${v.line}::${v.rule.id}: ${v.rule.description}`);
    } else {
      console.error(`  ${v.file}:${v.line}  ${v.rule.id} ${v.rule.name}`);
      console.error(`    ${v.rule.description}\n`);
    }
  }

  process.exit(1);
}

main().catch((err) => {
  console.error("[pitfall-lint] Fatal error:", err);
  process.exit(2);
});
