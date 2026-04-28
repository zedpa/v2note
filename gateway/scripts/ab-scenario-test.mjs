#!/usr/bin/env node
/**
 * 全场景 AI 模型对比测试
 *
 * 覆盖 V2Note 所有 AI 使用场景，为每个 tier 选择最优模型提供数据依据。
 *
 * 用法:
 *   node --env-file=gateway/.env gateway/scripts/ab-scenario-test.mjs              # 跑全部
 *   node --env-file=gateway/.env gateway/scripts/ab-scenario-test.mjs --tier fast  # 只跑 fast 场景
 *   node --env-file=gateway/.env gateway/scripts/ab-scenario-test.mjs --tier chat  # 只跑 chat 场景
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Provider 工厂 ───────────────────────────────────────────

const PROVIDERS = {};
function getProvider(name) {
  if (PROVIDERS[name]) return PROVIDERS[name];
  const configs = {
    dashscope: { key: "DASHSCOPE_API_KEY", url: process.env.AI_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1" },
    glm:       { key: "GLM_API_KEY",       url: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4" },
    deepseek:  { key: "DEEPSEEK_API_KEY",  url: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com" },
  };
  const cfg = configs[name];
  if (!cfg) throw new Error(`Unknown provider: ${name}`);
  const apiKey = process.env[cfg.key];
  if (!apiKey) return null;
  PROVIDERS[name] = createOpenAI({ apiKey, baseURL: cfg.url, name });
  return PROVIDERS[name];
}

// ── 模型候选 ────────────────────────────────────────────────

const MODELS = [
  { id: "ds-v4-pro",    model: "deepseek-v4-pro",   provider: "deepseek",  label: "DeepSeek-V4-Pro" },
  { id: "ds-v4-flash",  model: "deepseek-v4-flash",  provider: "deepseek",  label: "DeepSeek-V4-Flash" },
  { id: "glm-5.1",      model: "glm-5.1",            provider: "glm",       label: "GLM-5.1" },
  { id: "glm-4-plus",   model: "glm-4-plus",         provider: "glm",       label: "GLM-4-Plus" },
  { id: "qw-3.6-plus",  model: "qwen3.6-plus",       provider: "dashscope", label: "Qwen3.6-Plus" },
  { id: "qw-3.5-flash", model: "qwen3.5-flash",      provider: "dashscope", label: "Qwen3.5-Flash" },
];

// ── 全场景测试用例 ──────────────────────────────────────────

const SCENARIOS = [
  // ═══ FAST 层：提取/分类/结构化输出，要求低延迟 + JSON 准确 ═══
  {
    tier: "fast",
    id: "fast-todo-extract",
    name: "待办提取",
    desc: "从语音文本提取待办事项（JSON）",
    system: `你是一个待办提取器。从用户的语音记录中提取待办事项。
返回 JSON 数组：[{"text": "待办内容", "scheduled_start": "ISO时间或null", "priority": 1-5}]
只提取明确的行动意图，不要添加用户没说的。`,
    user: "明天下午两点要去银行办卡，还有周五之前把那个方案改完发给老王，对了晚上记得买菜",
    json: true,
    eval: (text) => {
      try { const arr = JSON.parse(text); return { valid: Array.isArray(arr) && arr.length >= 2, items: arr.length }; }
      catch { return { valid: false, items: 0 }; }
    },
  },
  {
    tier: "fast",
    id: "fast-intent-classify",
    name: "意图分类",
    desc: "语音意图分类（record/action/mixed）",
    system: `判断用户的语音输入是「记录」还是「指令」还是「混合」。
返回JSON: {"intent": "record"|"action"|"mixed", "reason": "一句话解释"}`,
    user: "帮我把明天的会议推迟到后天，顺便记一下我刚才想到的一个产品创意",
    json: true,
    eval: (text) => {
      try { const obj = JSON.parse(text); return { valid: obj.intent === "mixed", intent: obj.intent }; }
      catch { return { valid: false, intent: "parse_error" }; }
    },
  },
  {
    tier: "fast",
    id: "fast-time-estimate",
    name: "时间估算",
    desc: "估算待办耗时和优先级",
    system: `评估这个待办事项的属性。返回JSON:
{"estimated_minutes": number, "priority": 1-5, "domain": "工作|生活|学习|健康", "complexity": "low|medium|high"}`,
    user: "准备下周一的季度汇报PPT",
    json: true,
    eval: (text) => {
      try {
        const obj = JSON.parse(text);
        return { valid: obj.estimated_minutes > 30 && obj.priority >= 3, minutes: obj.estimated_minutes, priority: obj.priority };
      } catch { return { valid: false }; }
    },
  },
  {
    tier: "fast",
    id: "fast-page-route",
    name: "Wiki 页面路由",
    desc: "将日记内容路由到正确的 Wiki 页面",
    system: `你是知识路由器。根据日记内容，判断应归入哪个 Wiki 主题页面。
已有页面: ["职业发展", "人际关系", "健康管理", "财务规划", "个人成长"]
返回JSON: {"page_title": "匹配的页面标题", "confidence": 0.0-1.0, "new_page": false}
如果不匹配任何现有页面，设 new_page=true 并给出建议标题。`,
    user: "今天和老板谈了升职的事，他说要看Q3的表现，我觉得可以开始准备一下",
    json: true,
    eval: (text) => {
      try { const obj = JSON.parse(text); return { valid: obj.page_title === "职业发展" && obj.confidence > 0.7, page: obj.page_title }; }
      catch { return { valid: false }; }
    },
  },

  // ═══ AGENT 层：工具调用 + 简单对话，要求低延迟 + 自然 ═══
  {
    tier: "agent",
    id: "agent-tool-todo",
    name: "创建待办指令",
    desc: "用户要求创建待办，AI 应直接确认",
    system: `你是用户的数字伙伴路路。用户要求操作时直接做，不废话。回复不超过2句。`,
    user: "帮我创建一个待办：周五下午交季度报告",
    json: false,
    eval: (text) => ({ valid: text.length < 60, len: text.length }),
  },
  {
    tier: "agent",
    id: "agent-simple-reply",
    name: "简单回复",
    desc: "简单日常对话，不需要深度分析",
    system: `你是用户的数字伙伴路路。回复控制在1-3句话，不用比喻，说人话。`,
    user: "好的知道了",
    json: false,
    eval: (text) => ({ valid: text.length < 30, len: text.length }),
  },

  // ═══ CHAT 层：复杂对话 + 深度分析，要求质量 ═══
  {
    tier: "chat",
    id: "chat-emotional",
    name: "情感对话",
    desc: "用户情感倾诉，需要共情 + 记忆引用",
    system: `你是用户的数字伙伴路路。
## 说话方式
- 先接住，再回应
- 回复控制在1-3句话
- 不用比喻和修辞，说人话
- 最多问1个问题
## 相关记忆
[3天前] 用户提到最近工作压力很大，考虑换工作
[1周前] 用户说感觉自己在逃避重要决定
[2周前] 用户和上司发生了冲突`,
    user: "我真的好累，每天都在假装没事",
    json: false,
    eval: (text) => {
      const hasMemoryRef = /工作|上司|换工作|冲突|逃避|决定/.test(text);
      return { valid: text.length < 100 && hasMemoryRef, len: text.length, memRef: hasMemoryRef };
    },
  },
  {
    tier: "chat",
    id: "chat-analysis",
    name: "深度分析",
    desc: "用户要求分析问题，需要推理能力",
    system: `你是用户的数字伙伴路路。帮用户理清思路，用具体事实回应。
## 相关记忆
[1周前] 用户在A公司做了3年产品经理
[2周前] 用户收到B公司的offer，薪资涨30%但要去另一个城市
[3天前] 用户说女朋友不想搬家`,
    user: "帮我想想要不要接这个offer",
    json: false,
    eval: (text) => {
      const mentionsFactors = /薪资|城市|女朋友|搬家|3年/.test(text);
      return { valid: mentionsFactors && text.length < 200, len: text.length, factors: mentionsFactors };
    },
  },

  // ═══ REPORT 层：长文生成，要求内容深度 + 结构 + 洞察力 ═══
  {
    tier: "report",
    id: "report-weekly-review",
    name: "周复盘",
    desc: "从一周的日记生成深度复盘报告（长文）",
    system: `你是用户的认知伙伴。基于用户一周的日记记录，生成一份深度复盘报告。

要求：
- 300-600字
- 分为：本周关键事件回顾、情绪变化轨迹、行动模式观察、下周建议
- 语气温和但直接，像一个了解你的朋友在复盘
- 点出用户可能没意识到的模式和矛盾
- 不要泛泛而谈，必须引用具体事件`,
    user: `本周日记摘要:
周一: 和上司因需求变更吵了一架，觉得他根本不听我的。晚上失眠到3点。
周二: 强迫自己去跑了步，但心情还是很差。开始认真看招聘信息。
周三: B公司HR打电话来，薪资涨30%但要去杭州。和女朋友聊了，她犹豫。
周四: 开会被上司当众否定我的方案，忍住了没发作。回家后一直刷手机到凌晨。
周五: 决定认真考虑B公司offer。和两个前同事聊了，都建议走。晚上陪女朋友吃饭，没聊工作的事。
周末: 周六睡了一整天。周日整理了一下简历，心情反而平静了很多。`,
    json: false,
    eval: (text) => {
      const len = text.length;
      const hasStructure = /回顾|事件|情绪|模式|建议|下周/.test(text);
      const hasSpecific = /上司|B公司|女朋友|失眠|跑步|简历/.test(text);
      const hasInsight = /模式|矛盾|变化|没意识|值得注意|有趣的是|但/.test(text);
      return { valid: len >= 200 && hasStructure && hasSpecific && hasInsight, len, structure: hasStructure, specific: hasSpecific, insight: hasInsight };
    },
  },
  {
    tier: "report",
    id: "report-evening-summary",
    name: "晚间总结",
    desc: "从今日记录生成个性化晚间总结（长文）",
    system: `你是用户的认知伙伴。基于今天的记录，生成晚间总结。

要求：
- 150-300字
- 语气像朋友聊天，不是工作汇报
- 先肯定做到的，再温和指出可以改进的
- 如果有未完成的事，不要责备，而是理解原因
- 结尾展望明天，给一个具体的小建议`,
    user: `今日记录:
- 09:30 完成季度报告初稿（拖了两周终于搞定）
- 11:00 和产品团队开会讨论新功能，争论了1小时没结论
- 14:00 下午3点开会（迟到了5分钟）
- 16:00 收到一个客户的好评邮件，心情变好
- 18:00 报销单还是没交（已经逾期3天）
- 22:00 睡前刷手机1.5小时
待办完成: 3/5`,
    json: false,
    eval: (text) => {
      const len = text.length;
      const hasAffirm = /完成|搞定|好评|不错|做到/.test(text);
      const hasGentle = /报销|没交|逾期|刷手机/.test(text);
      const hasTomorrow = /明天|明日|试试|建议/.test(text);
      return { valid: len >= 100 && hasAffirm && hasGentle, len, affirm: hasAffirm, gentle: hasGentle, tomorrow: hasTomorrow };
    },
  },
  {
    tier: "report",
    id: "report-goal-pulse",
    name: "目标脉搏",
    desc: "分析目标进展并给出深度反馈（长文）",
    system: `你是用户的认知伙伴。分析用户的目标进展情况，给出深度反馈。

要求：
- 200-400字
- 不是机械的进度条，而是对用户行为模式的洞察
- 指出哪些目标在实际行动中被优先、哪些被忽视
- 对比用户说的优先级和实际行为的差异
- 给出1-2个可操作的建议`,
    user: `目标列表:
1. 职业转型（重要度:9）— 本周动作：更新简历、联系前同事、和B公司谈offer
2. 改善作息（重要度:8）— 本周动作：跑步1次、但3天熬夜到凌晨、周六睡了一整天
3. 维护感情（重要度:7）— 本周动作：周五陪女朋友吃饭1次、但没和她聊工作决定
4. 提升技能（重要度:6）— 本周动作：无`,
    json: false,
    eval: (text) => {
      const len = text.length;
      const hasContrast = /但|然而|虽然|不过|矛盾|差距|对比/.test(text);
      const hasActionable = /建议|可以|试试|不如|具体/.test(text);
      const hasInsight = /实际|优先|忽视|行动|说.*做|模式/.test(text);
      return { valid: len >= 150 && hasContrast && hasInsight, len, contrast: hasContrast, actionable: hasActionable, insight: hasInsight };
    },
  },
  {
    tier: "report",
    id: "report-contradiction",
    name: "认知矛盾检测",
    desc: "发现用户言行之间的矛盾并温和指出",
    system: `你是用户的认知伙伴。分析用户最近的记录，找出言行之间的矛盾或不一致。

要求：
- 150-300字
- 不是批评，而是帮用户看到自己没注意到的模式
- 每个矛盾都要引用具体的记录内容
- 用"我注意到"而非"你应该"的语气
- 最后留一个开放性问题，邀请用户思考`,
    user: `近期记录:
- 4/21: "我要开始早睡早起，11点前必须关手机"
- 4/22: 凌晨1:30还在刷小红书
- 4/23: "我不想再被工作绑架了，要多陪家人"
- 4/24: 又加班到10点，回家后跟老婆冷战
- 4/25: "我觉得自己执行力还可以"
- 4/26: 本周5个待办只完成了1个`,
    json: false,
    eval: (text) => {
      const len = text.length;
      const hasConcrete = /11点|1:30|小红书|10点|冷战|5个.*1个/.test(text);
      const hasTone = /注意到|发现|有趣|变化|不一致|矛盾/.test(text);
      const hasQuestion = /[？?]/.test(text);
      return { valid: len >= 100 && hasConcrete && hasTone, len, concrete: hasConcrete, tone: hasTone, question: hasQuestion };
    },
  },

  // ═══ BACKGROUND 层：记忆/画像/压缩，后台低优先级 ═══
  {
    tier: "background",
    id: "bg-memory-decide",
    name: "记忆决策",
    desc: "决定是否创建/更新/删除记忆",
    system: `你是记忆管理器。分析用户新输入，与已有记忆对比，决定操作。
已有记忆:
1. [重要度8] 用户在A公司做产品经理
2. [重要度6] 用户有女朋友，感情稳定
3. [重要度7] 用户最近工作压力大

返回JSON数组: [{"action": "ADD"|"UPDATE"|"DELETE"|"NONE", "memory_id": null|1|2|3, "content": "新内容", "importance": 1-10, "reason": "原因"}]`,
    user: "今天正式提了离职，老板挽留但我决心已定。和女朋友商量好了一起搬去新城市。",
    json: true,
    eval: (text) => {
      try {
        const arr = JSON.parse(text);
        const hasUpdate = arr.some(a => a.action === "UPDATE" && a.memory_id === 1);
        return { valid: Array.isArray(arr) && arr.length >= 2 && hasUpdate, actions: arr.length };
      } catch { return { valid: false }; }
    },
  },
  {
    tier: "background",
    id: "bg-chat-compress",
    name: "对话压缩",
    desc: "将长对话历史压缩为摘要",
    system: `将以下对话历史压缩为一段简洁的上下文摘要（100-200字），保留关键信息和情感基调。`,
    user: `用户: 最近工作好累
AI: 听到你说累，这周确实忙了很多。
用户: 老板总是临时加需求
AI: 上周也是这样，连续三周了。
用户: 我在想要不要换工作
AI: 这个想法你提过两次了，是什么让你一直犹豫？
用户: 主要是怕新环境适应不了
AI: 这种担心很正常。你之前换过一次工作，适应得很快。
用户: 说的也是，我再想想
AI: 不急，想清楚再决定。`,
    json: false,
    eval: (text) => ({ valid: text.length >= 50 && text.length <= 300 && /换工作|犹豫|适应/.test(text), len: text.length }),
  },
  {
    tier: "background",
    id: "bg-profile-update",
    name: "画像更新",
    desc: "从对话中更新用户画像",
    system: `你是用户画像维护器。当前画像:
## 基本信息
- 职业: A公司产品经理
- 关系: 有女朋友

根据新信息更新画像。直接输出更新后的完整画像（markdown格式），不要解释。`,
    user: "用户刚才提到已经从A公司离职，将入职B公司做高级产品经理，和女朋友计划一起搬到杭州。",
    json: false,
    eval: (text) => {
      const hasB = /B公司/.test(text);
      const hasSenior = /高级/.test(text);
      const hasHangzhou = /杭州/.test(text);
      return { valid: hasB && hasSenior && hasHangzhou, updates: [hasB, hasSenior, hasHangzhou].filter(Boolean).length };
    },
  },
];

// ── 执行引擎 ────────────────────────────────────────────────

const REASONING_PATTERNS = [/qwen3\.\d/, /qwen3-/, /qwen3\.5/, /deepseek-reason/];

async function runOne(scenario, modelCfg) {
  const prov = getProvider(modelCfg.provider);
  if (!prov) return { error: `${modelCfg.provider} not configured` };

  const isReasoning = REASONING_PATTERNS.some(p => p.test(modelCfg.model));
  const providerOptions = isReasoning ? { openai: { enable_thinking: false } } : {};

  const start = Date.now();
  try {
    const result = await generateText({
      model: prov.chat(modelCfg.model),
      messages: [
        { role: "system", content: scenario.system },
        { role: "user", content: scenario.user },
      ],
      temperature: scenario.json ? 0.2 : 0.7,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(120000),
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    });

    const elapsed = Date.now() - start;
    const text = result.text || "";
    // 清理 markdown code block
    const cleaned = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const evalResult = scenario.eval(cleaned);

    return { text: cleaned, elapsed, len: text.length, eval: evalResult, tokens: { in: result.usage?.inputTokens || 0, out: result.usage?.outputTokens || 0 } };
  } catch (err) {
    return { error: err.message, elapsed: Date.now() - start };
  }
}

// ── CLI ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const filterTier = args.includes("--tier") ? args[args.indexOf("--tier") + 1] : null;
const filterScenario = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

const scenariosToRun = SCENARIOS.filter(s => {
  if (filterTier && s.tier !== filterTier) return false;
  if (filterScenario && s.id !== filterScenario) return false;
  return true;
});

// 过滤可用模型
const availableModels = MODELS.filter(m => {
  try { return !!getProvider(m.provider); } catch { return false; }
});

// ── 主流程 ──────────────────────────────────────────────────

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║          V2Note 全场景 AI 模型对比测试                    ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");
  console.log(`可用模型: ${availableModels.map(m => m.label).join(", ")}`);
  console.log(`测试场景: ${scenariosToRun.length}/${SCENARIOS.length}`);
  console.log();

  const allResults = [];
  let lastTier = "";

  for (const scenario of scenariosToRun) {
    if (scenario.tier !== lastTier) {
      console.log(`\n${"═".repeat(70)}`);
      console.log(`  TIER: ${scenario.tier.toUpperCase()}`);
      console.log(`${"═".repeat(70)}`);
      lastTier = scenario.tier;
    }

    console.log(`\n📋 ${scenario.id} — ${scenario.name}`);
    console.log(`   ${scenario.desc}`);
    console.log(`${"─".repeat(60)}`);

    // 并行调用所有模型
    const promises = availableModels.map(modelCfg =>
      runOne(scenario, modelCfg).then(result => ({ modelCfg, result }))
    );
    const results = await Promise.all(promises);

    for (const { modelCfg, result } of results) {
      if (result.error) {
        console.log(`  ${modelCfg.label.padEnd(20)}❌ ERROR: ${result.error.slice(0, 50)}`);
      } else {
        const evalStr = result.eval.valid ? "✅" : "❌";
        const extra = Object.entries(result.eval).filter(([k]) => k !== "valid").map(([k,v]) => `${k}=${v}`).join(" ");
        console.log(`  ${modelCfg.label.padEnd(20)}${evalStr} ${String(result.elapsed).padStart(6)}ms ${String(result.len).padStart(4)}字 | ${extra} | ${result.text.replace(/\n/g," ").slice(0,60)}`);
      }

      allResults.push({
        scenario: scenario.id,
        scenarioName: scenario.name,
        tier: scenario.tier,
        model: modelCfg.id,
        modelLabel: modelCfg.label,
        provider: modelCfg.provider,
        ...result,
      });
    }
  }

  // ── 汇总 ──────────────────────────────────────────────────

  console.log(`\n${"═".repeat(70)}`);
  console.log("📊 汇总：每个 Tier 的最优模型推荐");
  console.log(`${"═".repeat(70)}\n`);

  const tiers = [...new Set(scenariosToRun.map(s => s.tier))];
  for (const tier of tiers) {
    const tierResults = allResults.filter(r => r.tier === tier && !r.error);
    const byModel = {};
    for (const r of tierResults) {
      if (!byModel[r.model]) byModel[r.model] = { label: r.modelLabel, results: [] };
      byModel[r.model].results.push(r);
    }

    console.log(`\n── ${tier.toUpperCase()} ──`);
    console.log("模型                | 通过率 | 平均耗时  | 平均字数");
    console.log("--------------------|--------|----------|--------");
    let bestModel = null, bestScore = -1;
    for (const [id, data] of Object.entries(byModel)) {
      const n = data.results.length;
      const pass = data.results.filter(r => r.eval?.valid).length;
      const avgMs = Math.round(data.results.reduce((s,r) => s + r.elapsed, 0) / n);
      const avgLen = Math.round(data.results.reduce((s,r) => s + (r.len||0), 0) / n);
      const passRate = Math.round(pass / n * 100);
      const score = passRate * 100 - avgMs / 100; // 通过率优先，耗时次之
      if (score > bestScore) { bestScore = score; bestModel = data.label; }
      console.log(`${data.label.padEnd(20)}| ${String(passRate).padStart(4)}%  | ${String(avgMs).padStart(7)}ms | ${String(avgLen).padStart(6)}`);
    }
    if (bestModel) console.log(`  → 推荐: ${bestModel}`);
  }

  // 保存
  const reportDir = join(__dirname, "../test-results/ab-scenario");
  mkdirSync(reportDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportPath = join(reportDir, `report-${ts}.json`);
  writeFileSync(reportPath, JSON.stringify(allResults, null, 2));
  console.log(`\n📁 详细结果: ${reportPath}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
