/**
 * E2E 计时测试：日记写入 → 待办提取 全链路性能分析
 *
 * 前置条件：
 *   1. pnpm dev（前端 localhost:3000）
 *   2. cd gateway && pnpm dev（后端 localhost:3001）
 *
 * 运行：npx playwright test e2e/pipeline-timing.spec.ts --reporter=list
 * 带浏览器：npx playwright test e2e/pipeline-timing.spec.ts --headed --reporter=list
 *
 * 输出：各环节耗时表 + 慢/失败根因诊断
 */
import { test, expect } from "@playwright/test";

const GW = process.env.GW_URL ?? "http://localhost:3001";
const APP = process.env.APP_URL ?? "http://localhost:3000";
const TEST_PHONE = "18793198472";
const TEST_PASSWORD = "718293";

// ── 计时器 ─────────────────────────────────────────────────
interface TimingEntry {
  phase: string;
  durationMs: number;
  status: "ok" | "slow" | "fail" | "skip";
  detail?: string;
}

class PipelineTimer {
  entries: TimingEntry[] = [];
  private t0 = Date.now();

  mark(phase: string): (status?: TimingEntry["status"], detail?: string) => void {
    const start = Date.now();
    return (status: TimingEntry["status"] = "ok", detail?: string) => {
      const durationMs = Date.now() - start;
      const finalStatus = status === "ok" && durationMs > 5000 ? "slow" : status;
      this.entries.push({ phase, durationMs, status: finalStatus, detail });
    };
  }

  report(title: string): string {
    const lines = [
      "",
      `══ ${title} ══`,
      "┌──────────────────────────┬──────────┬──────┬──────────────────────────┐",
      "│ 阶段                     │ 耗时(ms) │ 状态 │ 备注                     │",
      "├──────────────────────────┼──────────┼──────┼──────────────────────────┤",
    ];
    let total = 0;
    for (const e of this.entries) {
      const p = e.phase.padEnd(24);
      const d = String(e.durationMs).padStart(8);
      const s = e.status === "ok" ? " ✓ " : e.status === "slow" ? " ⚠ " : e.status === "fail" ? " ✗ " : " - ";
      const n = (e.detail ?? "").slice(0, 24).padEnd(24);
      lines.push(`│ ${p} │ ${d} │ ${s}  │ ${n} │`);
      total += e.durationMs;
    }
    lines.push("├──────────────────────────┼──────────┼──────┼──────────────────────────┤");
    lines.push(`│ ${"总计".padEnd(24)} │ ${String(total).padStart(8)} │      │                          │`);
    lines.push("└──────────────────────────┴──────────┴──────┴──────────────────────────┘");

    const slow = this.entries.filter((e) => e.status === "slow");
    const fail = this.entries.filter((e) => e.status === "fail");
    if (slow.length) {
      lines.push("\n⚠ 慢环节:");
      for (const s of slow) lines.push(`  ${s.phase}: ${s.durationMs}ms → ${DIAGNOSIS[s.phase] ?? "检查日志"}`);
    }
    if (fail.length) {
      lines.push("\n✗ 失败环节:");
      for (const f of fail) lines.push(`  ${f.phase}: ${f.detail} → ${failCause(f.detail)}`);
    }
    return lines.join("\n");
  }
}

const DIAGNOSIS: Record<string, string> = {
  "Process(VoiceAction分类)": "推理模型对简单分类浪费 thinking tokens → 改用规则预筛或 turbo 模型",
  "Process(AI文本清理)": "推理模型 ~20s 清理 10 字文本 → 合并到 Digest 省掉此步",
  "Digest(AI分解Strike)": "推理模型 thinking 占 97% tokens → 换非推理模型或合并 Process",
  "Strike写入(DB)": "逐条 INSERT → 改批量 INSERT ON CONFLICT",
  "Todo投影": "findPendingByUser 全表扫描 → 加索引",
  "全链路": "3 次 AI 调用(分类+清理+分解) → 合并为 1 次",
};

function failCause(detail?: string): string {
  if (detail?.includes("timeout")) return "AI 推理超时 — qwen3.5-plus 对复杂 prompt 可能需要 60s+";
  if (detail?.includes("JSON")) return "AI 返回非 JSON — 推理模型输出包含 thinking 前缀";
  if (detail?.includes("无 strike")) return "Digest AI 调用超时或返回空 — 检查 gateway 日志";
  if (detail?.includes("processing")) return "Process 卡住 — VoiceAction 分类 + AI 清理串行调用";
  return "检查 gateway console";
}

// ── 工具 ─────────────────────────────────────────────────────
async function poll<T>(
  fn: () => Promise<T>,
  check: (v: T) => boolean,
  maxMs = 60_000,
  interval = 1_000,
): Promise<{ result: T; elapsed: number }> {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const v = await fn();
    if (check(v)) return { result: v, elapsed: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, interval));
  }
  return { result: await fn(), elapsed: Date.now() - t0 };
}

async function apiGet(request: any, url: string, headers: Record<string, string>) {
  const resp = await request.get(url, { headers });
  if (!resp.ok()) return null;
  try { return await resp.json(); } catch { return null; }
}

async function setupAuth(request: any): Promise<{ deviceId: string; headers: Record<string, string> }> {
  const reg = await request.post(`${GW}/api/v1/devices/register`, {
    data: { identifier: `timing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, platform: "e2e-timing" },
  });
  const { id: deviceId } = await reg.json();
  const login = await request.post(`${GW}/api/v1/auth/login`, {
    data: { phone: TEST_PHONE, password: TEST_PASSWORD, deviceId },
  });
  const { accessToken } = await login.json();
  return {
    deviceId,
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": deviceId,
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// 测试 0：AI 基准测试 — 隔离测量 DashScope 延迟
// ══════════════════════════════════════════════════════════════
test("AI 基准: DashScope 响应延迟", async ({ request }) => {
  const health = await request.get(`${GW}/health`);
  if (!health.ok()) { test.skip(true, "Gateway 未运行"); return; }

  // 通过 gateway 的 health 端点确认可达性后，直接调 DashScope
  // 注意：这里用 fetch 直接调 API，不经过 gateway，隔离测量纯 AI 延迟
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.log("⚠ DASHSCOPE_API_KEY 未设置，跳过 AI 基准测试");
    console.log("  设置方式: set DASHSCOPE_API_KEY=sk-xxx && npx playwright test ...");
    return;
  }

  const baseUrl = process.env.AI_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1";
  const model = process.env.AI_MODEL ?? "qwen3.5-plus";

  console.log(`\n  AI 基准测试 — model: ${model}`);

  const cases = [
    { name: "极简(1字)", messages: [{ role: "user", content: "说一个字" }], maxTokens: 10 },
    { name: "JSON清理", messages: [
      { role: "system", content: '返回 JSON: {"summary": "清理后文本"}' },
      { role: "user", content: "明天下午三点提醒我打电话" },
    ]},
    { name: "Strike分解", messages: [
      { role: "system", content: '将文本分解为 Strike。返回 JSON: {"strikes":[{"nucleus":"","polarity":"intend","confidence":0.9,"tags":[]}],"bonds":[]}' },
      { role: "user", content: "后天开产品评审会记得准备PPT" },
    ]},
  ];

  for (const c of cases) {
    const t0 = Date.now();
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: c.messages, temperature: 0.3, ...(c.maxTokens ? { max_tokens: c.maxTokens } : {}) }),
        signal: AbortSignal.timeout(120_000),
      });
      const data = await resp.json() as any;
      const elapsed = Date.now() - t0;
      const choice = data.choices?.[0]?.message;
      const reasoning = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      const output = data.usage?.completion_tokens ?? 0;
      const thinkRatio = reasoning > 0 ? ((reasoning / output) * 100).toFixed(0) : "0";

      console.log(`  ${c.name}: ${elapsed}ms | output=${output} tokens | thinking=${reasoning} tokens (${thinkRatio}%)`);
      console.log(`    response: ${(choice?.content ?? data.error?.message ?? "").slice(0, 80)}`);

      if (elapsed > 10_000) {
        console.log(`    ⚠ 超过 10s — 推理模型 thinking 时间过长`);
      }
    } catch (e: any) {
      console.log(`  ${c.name}: FAIL in ${Date.now() - t0}ms — ${e.message}`);
    }
  }

  console.log(`\n  诊断: 如果每个 case > 15s，根因是推理模型(${model})的 thinking overhead`);
  console.log(`  方案: 非推理模型(qwen-plus/qwen-turbo)可将延迟从 ~20s 降到 ~2s`);
});

// ══════════════════════════════════════════════════════════════
// 测试 1：纯 API 全链路计时
// ══════════════════════════════════════════════════════════════
test("全链路计时: 文字→Process→Digest→Todo", async ({ request }) => {
  const health = await request.get(`${GW}/health`);
  if (!health.ok()) { test.skip(true, "Gateway 未运行"); return; }

  const timer = new PipelineTimer();
  const { headers: H } = await setupAuth(request);

  // ── 测试 A: 日记型输入（触发 Digest→Strike→Todo 完整管道）──────
  // 注意：不能用"提醒我"之类的指令型文本，否则会被 VoiceAction 拦截为 action，跳过 Digest
  console.log("\n  === 测试 A: 日记型输入（完整 Digest 管道）===");
  const diaryText = "今天开了产品评审会，张经理说下周五之前要把新版设计稿发给客户。另外后天下午两点有个技术对齐会。";

  const endCreate = timer.mark("Record创建");
  const createResp = await request.post(`${GW}/api/v1/records/manual`, {
    headers: H,
    data: { content: diaryText, useAi: true },
  });
  expect(createResp.ok()).toBe(true);
  const { id: recordId } = await createResp.json();
  endCreate("ok", `id=${recordId.slice(0, 8)}`);

  // 2. 等 Process 完成
  const endProcess = timer.mark("Process(全部)");
  const { result: rec, elapsed: processMs } = await poll(
    () => apiGet(request, `${GW}/api/v1/records/${recordId}`, H),
    (r) => r?.status === "completed" || r?.status === "error",
    120_000,
    1_000,
  );
  if (!rec || rec.status !== "completed") {
    endProcess("fail", rec?.status === "error" ? "AI错误" : `timeout ${processMs}ms(status=${rec?.status})`);
    console.log("\n  ✗ Process 未完成，后续环节无法继续");
    console.log(timer.report("Process 超时分析"));
    return;
  }
  endProcess("ok", `${processMs}ms`);
  console.log(`  Process 完成: ${processMs}ms`);

  // 3. 检查 Summary
  const endSummary = timer.mark("Summary检查");
  const summary = await apiGet(request, `${GW}/api/v1/records/${recordId}/summary`, H);
  endSummary(summary?.short_summary ? "ok" : "fail", summary?.short_summary?.slice(0, 20) ?? "无 summary");

  // 4. 等 Strikes 出现（Digest 异步执行）
  const endDigest = timer.mark("Digest(AI分解Strike)");
  const { result: strikes, elapsed: digestMs } = await poll(
    () => apiGet(request, `${GW}/api/v1/records/${recordId}/strikes`, H),
    (s) => Array.isArray(s) && s.length > 0,
    60_000,
    1_000,
  );
  const strikeArr = Array.isArray(strikes) ? strikes : [];
  if (strikeArr.length === 0) {
    endDigest("fail", `无 strike (等待${digestMs}ms)`);

    const recAfter = await apiGet(request, `${GW}/api/v1/records/${recordId}`, H);
    console.log(`    record.digested = ${recAfter?.digested}`);
    if (!recAfter?.digested) {
      console.log(`    Digest 未触发或管道失败 → 检查 gateway 日志`);
      console.log(`    可能原因: VoiceAction 分类为 action 跳过了 Digest`);
    } else {
      console.log(`    Record 已 digested 但无 Strike → AI 返回空或 JSON 解析失败`);
    }
  } else {
    endDigest("ok", `${strikeArr.length} strikes, ${digestMs}ms`);

    console.log(`\n  Strikes (${strikeArr.length}):`);
    for (const s of strikeArr) {
      console.log(`    [${s.polarity}] ${s.nucleus} (conf=${s.confidence})`);
      if (s.field) console.log(`      field: ${JSON.stringify(s.field).slice(0, 120)}`);
    }

    const intends = strikeArr.filter((s: any) => s.polarity === "intend");
    if (intends.length === 0) {
      console.log(`  ⚠ 无 intend strike — AI 未识别为待办意图`);
    }
  }

  // 5. 等 Todo 出现（Digest 管道投影 或 Process 直接提取）
  const endTodo = timer.mark("Todo投影");
  const keywords = ["设计稿", "客户", "技术对齐", "张经理", "评审"];
  const { result: todos, elapsed: todoMs } = await poll(
    () => apiGet(request, `${GW}/api/v1/todos`, H),
    (list) => Array.isArray(list) && list.length > 0,
    30_000,
    1_000,
  );
  const todoList = Array.isArray(todos) ? todos : [];
  const match = todoList.find((t: any) => keywords.some((kw) => t.text?.includes(kw)));
  if (match) {
    endTodo("ok", match.text?.slice(0, 20));
    console.log(`\n  Todo: "${match.text}"`);
    console.log(`    scheduled: ${match.scheduled_start ?? "无"} | domain: ${match.domain ?? "无"} | impact: ${match.impact ?? "无"}`);
  } else if (todoList.length > 0) {
    endTodo("ok", `${todoList.length} todos(无关键词匹配)`);
    console.log(`\n  Todos found (${todoList.length}), but no keyword match:`);
    for (const t of todoList.slice(0, 3)) {
      console.log(`    "${t.text?.slice(0, 50)}"`);
    }
  } else {
    endTodo("fail", `无待办 (${todoMs}ms)`);
    if (strikeArr.some((s: any) => s.polarity === "intend")) {
      console.log(`    有 intend strike 但无 todo → projectIntendStrike 失败`);
    } else {
      console.log(`    无 intend strike → AI 未从文本识别出待办意图`);
    }
  }

  console.log(timer.report("全链路计时"));
});

// ══════════════════════════════════════════════════════════════
// 测试 2：浏览器 UI 路径（文本输入→Toast→Todo 显示）
// ══════════════════════════════════════════════════════════════
test("浏览器 UI: 输入→提交→等待Todo显示", async ({ page, request }) => {
  const health = await request.get(`${GW}/health`);
  if (!health.ok()) { test.skip(true, "Gateway 未运行"); return; }

  const timer = new PipelineTimer();
  const { deviceId, headers: H } = await setupAuth(request);
  // 拆出 token
  const accessToken = H.Authorization.replace("Bearer ", "");

  // 1. 打开页面 + 注入登录态
  const endPage = timer.mark("页面加载");
  await page.goto(APP);
  await page.evaluate(
    ({ deviceId, accessToken }) => {
      localStorage.setItem("v2note_device_id", deviceId);
      localStorage.setItem("v2note_access_token", accessToken);
    },
    { deviceId, accessToken },
  );
  await page.reload();
  await page.waitForLoadState("networkidle");
  endPage("ok");

  // 2. 切到文本模式 + 输入
  const endInput = timer.mark("UI输入→提交");
  // 找 Keyboard 图标（SVG class）切到文本模式
  const switchBtn = page.locator("button").filter({ has: page.locator('[class*="lucide-keyboard"], [data-lucide="keyboard"]') });
  if (await switchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await switchBtn.click();
  }
  const textarea = page.locator('textarea[placeholder*="输入"]');
  await textarea.waitFor({ state: "visible", timeout: 5000 });
  const input = "下周一上午九点开季度总结会";
  await textarea.fill(input);
  await textarea.press("Enter");
  endInput("ok");

  // 3. 等 Toast "已保存" 出现
  const endToast = timer.mark("Toast确认");
  const toastOk = await page.locator('text=已保存').isVisible({ timeout: 10_000 }).catch(() => false);
  endToast(toastOk ? "ok" : "fail", toastOk ? "已保存" : "无 toast");

  // 4. 通过 API 轮询后端状态（浏览器页面内无法直接观测后端进度）
  // 先找到 recordId
  const endRecord = timer.mark("Record出现(API)");
  const { result: records } = await poll(
    () => apiGet(request, `${GW}/api/v1/records?limit=3`, H),
    (r) => Array.isArray(r) && r.length > 0,
    10_000,
    500,
  );
  const recordId = records?.[0]?.id;
  endRecord(recordId ? "ok" : "fail", recordId ? `id=${recordId.slice(0, 8)}` : "未找到");

  if (recordId) {
    // 5. Process 完成
    const endProcess = timer.mark("Process完成");
    const { result: rec, elapsed: pMs } = await poll(
      () => apiGet(request, `${GW}/api/v1/records/${recordId}`, H),
      (r) => r?.status === "completed" || r?.status === "error",
      120_000,
      1_000,
    );
    endProcess(rec?.status === "completed" ? "ok" : "fail", `${pMs}ms status=${rec?.status}`);

    // 6. Strikes
    const endDigest = timer.mark("Digest完成");
    const { result: strikes, elapsed: dMs } = await poll(
      () => apiGet(request, `${GW}/api/v1/records/${recordId}/strikes`, H),
      (s) => Array.isArray(s) && s.length > 0,
      120_000,
      1_000,
    );
    const sArr = Array.isArray(strikes) ? strikes : [];
    endDigest(sArr.length > 0 ? "ok" : "fail", `${sArr.length} strikes, ${dMs}ms`);

    // 7. Todo
    const endTodo = timer.mark("Todo产生");
    const { result: todos, elapsed: tMs } = await poll(
      () => apiGet(request, `${GW}/api/v1/todos`, H),
      (list) => Array.isArray(list) && list.some((t: any) => t.text?.includes("总结") || t.text?.includes("季度")),
      30_000,
      1_000,
    );
    const match = (todos ?? []).find((t: any) => t.text?.includes("总结") || t.text?.includes("季度"));
    endTodo(match ? "ok" : "fail", match ? match.text?.slice(0, 20) : `无(${tMs}ms)`);

    // 8. 检查前端 Todo tab 显示
    if (match) {
      const endDisplay = timer.mark("前端Todo渲染");
      const todoTab = page.locator('button:has-text("待办"), [data-tab="todos"]');
      if (await todoTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await todoTab.click();
      }
      const visible = await page.locator('text=总结').isVisible({ timeout: 10_000 }).catch(() => false);
      endDisplay(visible ? "ok" : "skip", visible ? "已显示" : "未渲染(可能需刷新)");
    }
  }

  console.log(timer.report("浏览器 UI 计时"));
});

// ══════════════════════════════════════════════════════════════
// 测试 3：WebSocket todo.created 事件延迟
// ══════════════════════════════════════════════════════════════
test("WebSocket: todo.created 推送延迟", async ({ page, request }) => {
  const health = await request.get(`${GW}/health`);
  if (!health.ok()) { test.skip(true, "Gateway 未运行"); return; }

  const { deviceId, headers: H } = await setupAuth(request);
  const accessToken = H.Authorization.replace("Bearer ", "");

  // 在浏览器建 WS 连接
  await page.goto(APP);
  const wsUrl = GW.replace("http", "ws");
  await page.evaluate(
    ({ wsUrl, accessToken, deviceId }) => {
      (window as any).__ws = { messages: [], ready: false, todoCreated: false };
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", payload: { token: accessToken, deviceId } }));
        (window as any).__ws.ready = true;
      };
      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          (window as any).__ws.messages.push({ type: msg.type, payload: msg.payload, time: Date.now() });
          if (msg.type === "todo.created") (window as any).__ws.todoCreated = true;
        } catch {}
      };
      ws.onerror = () => { (window as any).__ws.error = true; };
    },
    { wsUrl, accessToken, deviceId },
  );

  // 等 WS 就绪
  await poll(() => page.evaluate(() => (window as any).__ws.ready), (r) => r === true, 5000, 200);

  const submitTime = Date.now();
  console.log(`\n  WS 已连接，提交日记...`);

  // 提交
  const createResp = await request.post(`${GW}/api/v1/records/manual`, {
    headers: H,
    data: { content: "后天上午十点开产品评审会记得准备PPT", useAi: true },
  });
  expect(createResp.ok()).toBe(true);
  const { id: recordId } = await createResp.json();
  console.log(`  Record: ${recordId}`);

  // 等 todo.created 或超时
  const { elapsed } = await poll(
    () => page.evaluate(() => (window as any).__ws.todoCreated),
    (v) => v === true,
    180_000,
    500,
  );

  // 收集消息
  const msgs: Array<{ type: string; payload: any; time: number }> = await page.evaluate(() => (window as any).__ws.messages);
  const wsError = await page.evaluate(() => (window as any).__ws.error);

  console.log(`\n  ── WebSocket 事件时间线 ──`);
  for (const m of msgs) {
    console.log(`  +${String(m.time - submitTime).padStart(7)}ms  ${m.type}`);
  }

  const todoMsg = msgs.find((m) => m.type === "todo.created");
  if (todoMsg) {
    const delay = todoMsg.time - submitTime;
    console.log(`\n  ✓ todo.created 延迟: ${delay}ms`);
    console.log(`    含: Process(~20-40s) + Digest(~20-40s) + Todo投影(~1s) + WS广播(<1ms)`);
  } else {
    console.log(`\n  ✗ 未收到 todo.created (等待 ${elapsed}ms)`);
    if (wsError) console.log(`    WS 连接错误`);

    // 回退查 API
    const todos = await apiGet(request, `${GW}/api/v1/todos`, H);
    const match = (todos ?? []).find((t: any) => t.text?.includes("评审") || t.text?.includes("PPT"));
    if (match) {
      console.log(`    API 有待办: "${match.text}" → eventBus 广播或 WS 路由问题`);
    } else {
      // 检查 strikes
      const strikes = await apiGet(request, `${GW}/api/v1/records/${recordId}/strikes`, H);
      const sArr = Array.isArray(strikes) ? strikes : [];
      console.log(`    Strikes: ${sArr.length} | Record digested: ${(await apiGet(request, `${GW}/api/v1/records/${recordId}`, H))?.digested}`);
      if (sArr.length === 0) {
        console.log(`    → Digest 失败（AI 超时或返回非 JSON）`);
      } else if (!sArr.some((s: any) => s.polarity === "intend")) {
        console.log(`    → 有 Strike 但无 intend → AI 未识别为待办意图`);
      } else {
        console.log(`    → 有 intend Strike 但无 Todo → projectIntendStrike 去重或 DB 写入失败`);
      }
    }
  }
});
