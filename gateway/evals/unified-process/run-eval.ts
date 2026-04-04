/**
 * Unified Process Prompt Eval Runner
 *
 * 用法：
 *   cd gateway && npx tsx evals/unified-process/run-eval.ts [--runs 3] [--iteration 1]
 *
 * 流程：
 *   1. 登录获取 token
 *   2. 逐条提交 prompt → POST /api/v1/records/manual
 *   3. Poll 等待处理完成
 *   4. 获取 strikes + todos
 *   5. 对每条 assertion 评分
 *   6. 输出 benchmark JSON
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GW = process.env.GW_URL ?? "http://localhost:3001";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";
const RUNS = parseInt(process.argv.find((_, i, a) => a[i - 1] === "--runs") ?? "1", 10);
const ITERATION = process.argv.find((_, i, a) => a[i - 1] === "--iteration") ?? "1";

// ─── HTTP helpers ───────────────────────────────────────────────────────────

async function post(url: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

async function get(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

async function poll<T>(
  fn: () => Promise<T>,
  check: (v: T) => boolean,
  maxMs = 120_000,
  interval = 2_000,
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (check(v)) return v;
    await new Promise((r) => setTimeout(r, interval));
  }
  return fn();
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function setupAuth() {
  const reg = await post(`${GW}/api/v1/devices/register`, {
    identifier: `eval-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    platform: "eval",
  });
  if (!reg.ok) throw new Error(`设备注册失败: ${reg.status}`);
  const deviceId = reg.data.id;

  const login = await post(`${GW}/api/v1/auth/login`, {
    phone: TEST_PHONE, password: TEST_PASSWORD, deviceId,
  });
  if (!login.ok) throw new Error(`登录失败: ${login.status}`);

  return {
    deviceId,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      "Authorization": `Bearer ${login.data.accessToken}`,
    },
  };
}

// ─── Submit + collect ───────────────────────────────────────────────────────

interface CollectedResult {
  recordId: string;
  strikes: any[];
  todos: any[];
  bonds: any[];
  durationMs: number;
}

async function submitAndCollect(headers: Record<string, string>, prompt: string): Promise<CollectedResult> {
  const t0 = Date.now();

  // 快照当前 todo 列表（用于之后对比找新增）
  const beforeTodos = await get(`${GW}/api/v1/todos`, headers);
  const beforeList = Array.isArray(beforeTodos.data) ? beforeTodos.data : [];
  const beforeIds = new Set(beforeList.map((t: any) => t.id));

  const createResp = await fetch(`${GW}/api/v1/records/manual`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content: prompt, useAi: true }),
  });
  if (!createResp.ok) throw new Error(`创建失败: ${createResp.status}`);
  const { id: recordId } = await createResp.json() as any;

  // 等待处理完成
  const record = await poll(
    async () => {
      const r = await get(`${GW}/api/v1/records/${recordId}`, headers);
      return r.data;
    },
    (r: any) => r?.status === "completed" || r?.status === "error",
    120_000,
    2_000,
  );
  if (record?.status !== "completed") {
    throw new Error(`处理失败: ${record?.status}`);
  }

  // 获取 strikes
  const strikes = await poll(
    async () => {
      const r = await get(`${GW}/api/v1/records/${recordId}/strikes`, headers);
      return r.data ?? [];
    },
    (list: any[]) => list.length > 0,
    30_000,
    2_000,
  );

  // 等待 todo 投影完成（intend strike → todo 是异步 fire-and-forget）
  const hasIntend = strikes.some((s: any) => s.polarity === "intend");
  let newTodos: any[] = [];

  // 始终等待并检查新 todo（projectIntendStrike 是异步的，需额外等待）
  const todoWaitMs = hasIntend ? 45_000 : 5_000;
  newTodos = await poll(
    async () => {
      const r = await get(`${GW}/api/v1/todos`, headers);
      const all = r.data ?? [];
      const fresh = all.filter((t: any) => !beforeIds.has(t.id));
      return fresh;
    },
    (list: any[]) => hasIntend ? list.length > 0 : true, // 非 intend 不要求有新 todo
    todoWaitMs,
    3_000,
  );

  // 获取 bonds（通过每个 strike 的 trace）
  const bonds: any[] = [];
  for (const s of strikes) {
    const trace = await get(`${GW}/api/v1/strikes/${s.id}/trace`, headers);
    if (trace.data?.bonds) {
      bonds.push(...trace.data.bonds);
    }
  }

  const durationMs = Date.now() - t0;
  return { recordId, strikes, todos: newTodos, bonds, durationMs };
}

// ─── Assertion evaluation ───────────────────────────────────────────────────

interface Assertion {
  field: string;
  op: string;
  value: any;
  note?: string;
}

interface AssertionResult {
  field: string;
  op: string;
  expected: any;
  actual: any;
  passed: boolean;
  note?: string;
}

function evaluateAssertion(a: Assertion, result: CollectedResult, _prompt: string): AssertionResult {
  const { strikes, todos, bonds } = result;

  // todos 已经是新增的（通过快照对比），直接使用
  const newTodosCount = todos.length;
  const firstTodo = todos[0];

  let actual: any;

  // 解析 field 路径
  if (a.field === "todos_created") {
    actual = newTodosCount;
  } else if (a.field === "strikes") {
    actual = strikes;
  } else if (a.field === "bonds") {
    actual = bonds;
  } else if (a.field === "has_intend") {
    actual = strikes.some((s: any) => s.polarity === "intend");
  } else if (a.field === "has_non_intend") {
    actual = strikes.some((s: any) => s.polarity !== "intend");
  } else if (a.field === "strikes_all_intend") {
    actual = strikes.length > 0 && strikes.every((s: any) => s.polarity === "intend");
  } else if (a.field === "strike_has_goal_id") {
    actual = strikes.some((s: any) => s.field?.matched_goal_id != null);
  } else if (a.field === "feel_not_in_bond") {
    const feelIds = new Set(strikes.filter((s: any) => s.polarity === "feel").map((s: any) => s.id));
    actual = bonds.every((b: any) => !feelIds.has(b.source_strike_id) && !feelIds.has(b.target_strike_id));
  } else if (a.field.startsWith("strikes[?].polarity")) {
    actual = strikes.map((s: any) => s.polarity);
  } else if (a.field.match(/^strikes\[\d+\]\./)) {
    const m = a.field.match(/^strikes\[(\d+)\]\.(.+)/);
    if (m) {
      const idx = parseInt(m[1]);
      const prop = m[2];
      actual = strikes[idx]?.[prop];
    }
  } else if (a.field.match(/^bonds\[\d+\]\./)) {
    const m = a.field.match(/^bonds\[(\d+)\]\.(.+)/);
    if (m) {
      const idx = parseInt(m[1]);
      const prop = m[2];
      actual = bonds[idx]?.[prop];
    }
  } else if (a.field.startsWith("todo.")) {
    const prop = a.field.replace("todo.", "");
    actual = firstTodo?.[prop];
  }

  // 评估 op
  let passed = false;
  switch (a.op) {
    case "eq":
      passed = actual === a.value;
      break;
    case "contains":
      passed = typeof actual === "string" && actual.includes(a.value);
      break;
    case "not_contains":
      if (Array.isArray(actual)) {
        passed = !actual.includes(a.value);
      } else {
        passed = typeof actual === "string" && !actual.includes(a.value);
      }
      break;
    case "time_contains":
      // 从 ISO 时间串中提取时:分 部分比对
      if (typeof actual === "string") {
        // "2026-04-04T20:30:00.000Z" → 提取 T 后的 HH:MM
        const timeMatch = actual.match(/T(\d{2}:\d{2})/);
        passed = timeMatch ? timeMatch[1] === a.value.replace("T", "") : false;
      }
      break;
    case "gte":
      passed = typeof actual === "number" && actual >= a.value;
      break;
    case "length":
      passed = Array.isArray(actual) && actual.length === a.value;
      break;
    case "length_gte":
      passed = Array.isArray(actual) && actual.length >= a.value;
      break;
    case "in":
      passed = Array.isArray(a.value) && a.value.includes(actual);
      break;
    default:
      passed = false;
  }

  return { field: a.field, op: a.op, expected: a.value, actual: summarize(actual), passed, note: a.note };
}

function summarize(v: any): any {
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (v && typeof v === "object") return JSON.stringify(v).slice(0, 100);
  return v;
}

// ─── Main ───────────────────────────────────────────────────────────────────

interface EvalCase {
  id: string;
  prompt: string;
  category: string;
  assertions: Assertion[];
}

interface EvalResult {
  id: string;
  prompt: string;
  category: string;
  run: number;
  durationMs: number;
  strikes: any[];
  todosCreated: number;
  bondsCreated: number;
  assertions: AssertionResult[];
  allPassed: boolean;
}

async function main() {
  console.log(`\n🧪 Unified Process Eval — Iteration ${ITERATION}, ${RUNS} run(s) per case\n`);

  // 检查 gateway
  const health = await get(`${GW}/health`);
  if (!health.ok) {
    console.error("❌ Gateway 未运行");
    process.exit(1);
  }

  // 加载用例
  const evalsPath = path.join(__dirname, "evals.json");
  const { evals } = JSON.parse(fs.readFileSync(evalsPath, "utf-8")) as { evals: EvalCase[] };
  console.log(`📋 ${evals.length} 个测试用例\n`);

  // 整个 eval 复用同一个认证（避免 rate limit）
  const auth = await setupAuth();
  const { headers } = auth;

  // 首次清理该用户所有 todo，避免历史数据污染去重
  console.log("🧹 清理历史 todo...");
  const existingTodos = await get(`${GW}/api/v1/todos`, headers);
  const todoArr = Array.isArray(existingTodos.data) ? existingTodos.data : [];
  for (const t of todoArr) {
    await fetch(`${GW}/api/v1/todos/${t.id}`, { method: "DELETE", headers });
    await new Promise((r) => setTimeout(r, 250)); // 节流避免 rate limit
  }
  console.log(`   已清理 ${todoArr.length} 条\n`);

  // 等待 rate limit 桶恢复
  if (todoArr.length > 5) {
    console.log("   ⏳ 等待 rate limit 恢复...\n");
    await new Promise((r) => setTimeout(r, 3_000));
  }

  const allResults: EvalResult[] = [];
  const categoryStats: Record<string, { total: number; passed: number }> = {};

  for (const evalCase of evals) {
    for (let run = 1; run <= RUNS; run++) {
      const label = RUNS > 1 ? `[${evalCase.id} #${run}]` : `[${evalCase.id}]`;
      process.stdout.write(`${label} "${evalCase.prompt.slice(0, 30)}..." `);

      try {
        const collected = await submitAndCollect(headers, evalCase.prompt);

        const assertionResults = evalCase.assertions.map(a =>
          evaluateAssertion(a, collected, evalCase.prompt)
        );
        const allPassed = assertionResults.every(a => a.passed);

        const result: EvalResult = {
          id: evalCase.id,
          prompt: evalCase.prompt,
          category: evalCase.category,
          run,
          durationMs: collected.durationMs,
          strikes: collected.strikes.map((s: any) => ({
            polarity: s.polarity,
            nucleus: s.nucleus,
            field: s.field,
          })),
          todosCreated: collected.todos.length,
          bondsCreated: collected.bonds.length,
          assertions: assertionResults,
          allPassed,
        };
        allResults.push(result);

        // 统计
        const cat = evalCase.category;
        if (!categoryStats[cat]) categoryStats[cat] = { total: 0, passed: 0 };
        categoryStats[cat].total++;
        if (allPassed) categoryStats[cat].passed++;

        const icon = allPassed ? "✅" : "❌";
        const failedAssertions = assertionResults.filter(a => !a.passed);
        const failInfo = failedAssertions.length > 0
          ? ` FAILED: ${failedAssertions.map(a => `${a.field}(expected=${a.expected}, got=${a.actual})`).join(", ")}`
          : "";
        console.log(`${icon} ${collected.durationMs}ms | strikes=${collected.strikes.length} todos=${collected.todos.length} bonds=${collected.bonds.length}${failInfo}`);
      } catch (err: any) {
        console.log(`💥 ERROR: ${err.message}`);
        allResults.push({
          id: evalCase.id,
          prompt: evalCase.prompt,
          category: evalCase.category,
          run,
          durationMs: 0,
          strikes: [],
          todosCreated: 0,
          bondsCreated: 0,
          assertions: evalCase.assertions.map(a => ({
            field: a.field, op: a.op, expected: a.value, actual: "ERROR", passed: false,
          })),
          allPassed: false,
        });
      }
    }
  }

  // ─── Benchmark Summary ──────────────────────────────────────────────────

  console.log("\n" + "═".repeat(60));
  console.log("📊 BENCHMARK SUMMARY");
  console.log("═".repeat(60));

  let totalPassed = 0;
  let totalCases = 0;
  let totalDuration = 0;

  for (const [cat, stats] of Object.entries(categoryStats)) {
    const rate = ((stats.passed / stats.total) * 100).toFixed(0);
    const icon = stats.passed === stats.total ? "✅" : "⚠️";
    console.log(`${icon} ${cat}: ${stats.passed}/${stats.total} (${rate}%)`);
    totalPassed += stats.passed;
    totalCases += stats.total;
  }

  for (const r of allResults) totalDuration += r.durationMs;
  const avgDuration = totalCases > 0 ? (totalDuration / totalCases / 1000).toFixed(1) : "0";
  const overallRate = totalCases > 0 ? ((totalPassed / totalCases) * 100).toFixed(1) : "0";

  console.log("─".repeat(60));
  console.log(`Overall: ${totalPassed}/${totalCases} (${overallRate}%)`);
  console.log(`Avg duration: ${avgDuration}s per case`);
  console.log("═".repeat(60));

  // ─── Save results ─────────────────────────────────────────────────────

  const outDir = path.join(__dirname, "results", `iteration-${ITERATION}`);
  fs.mkdirSync(outDir, { recursive: true });

  const benchmark = {
    iteration: ITERATION,
    timestamp: new Date().toISOString(),
    totalCases,
    totalPassed,
    overallPassRate: parseFloat(overallRate),
    avgDurationMs: totalDuration / totalCases,
    categoryStats,
    results: allResults,
  };

  fs.writeFileSync(path.join(outDir, "eval-results.json"), JSON.stringify(allResults, null, 2));
  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify(benchmark, null, 2));
  console.log(`\n💾 Results saved to ${outDir}/`);
}

main().catch(console.error);
