import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GenerateReviewPayload {
  device_id: string;
  period: "daily" | "weekly" | "monthly" | "yearly";
  period_start: string; // ISO date e.g. "2026-01-05"
  period_end: string;
}

// ── State detection for manager (weekly) ────────────────────────────────

const STATE_A_KEYWORDS = ["业绩", "转化", "客户数", "完成率", "增长", "下滑", "KPI", "签约", "成交", "回款", "指标", "目标"];
const STATE_B_KEYWORDS = ["表现", "沟通", "执行力", "态度", "团队", "培训", "辅导", "离职", "士气", "协作", "一对一", "反馈"];

function detectManagerState(allText: string): "A" | "B" {
  let scoreA = 0;
  let scoreB = 0;
  for (const kw of STATE_A_KEYWORDS) {
    const matches = allText.match(new RegExp(kw, "g"));
    if (matches) scoreA += matches.length;
  }
  for (const kw of STATE_B_KEYWORDS) {
    const matches = allText.match(new RegExp(kw, "g"));
    if (matches) scoreB += matches.length;
  }
  return scoreB > scoreA ? "B" : "A";
}

// ── Prompt builders ──────────────────────────────────────────────────────

function buildDailyPrompt(userType: string | null, context: string): { system: string; user: string; useJson: boolean } {
  if (userType === "manager") {
    return {
      system: "你是一个面向销售/区域经理的日盘点助手。请按以下5个维度总结今日工作（纯文本，每个维度一个段落）：\n1. 今天发生了什么事？— 关键事件和客户动态\n2. 今天做了什么事？— 完成的工作和拜访\n3. 后边还要做什么事？— 明日计划和跟进\n4. 情绪/精力/吐槽如何？— 今日状态\n5. 点评建议 — 对今日工作的简短点评",
      user: context,
      useJson: false,
    };
  }
  if (userType === "creator") {
    return {
      system: "你是一个面向创作者的日盘点助手。请按以下5个维度总结今日（纯文本，每个维度一个段落）：\n1. 今天发生了什么事？— 关键事件和灵感来源\n2. 今天做了什么事？— 创作进展和产出\n3. 后边还要做什么事？— 明日创作计划\n4. 情绪/精力/吐槽如何？— 创作状态和能量\n5. 点评建议 — 对今日创作的简短建议",
      user: context,
      useJson: false,
    };
  }
  return {
    system: "你是一个日盘点助手。请按以下5个维度总结今日（纯文本，每个维度一个段落）：\n1. 今天发生了什么事？— 关键事件和信息\n2. 今天做了什么事？— 完成的工作和行动\n3. 后边还要做什么事？— 待办和计划\n4. 情绪/精力/吐槽如何？— 状态和感受\n5. 点评建议 — AI 对这一天的简短点评和建议",
    user: context,
    useJson: false,
  };
}

function buildWeeklyPrompt(userType: string | null, context: string, allText: string): { system: string; user: string; useJson: boolean } {
  if (userType === "manager") {
    const state = detectManagerState(allText);
    if (state === "A") {
      return {
        system: `你是一个面向销售/区域经理的周盘分析助手。本周管理重心偏向：指标压力型。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "A",
  "state_label": "指标压力型",
  "sections": {
    "key_events": { "new_clients": [""], "existing_clients": [""], "market_actions": [""] },
    "impact_factors": { "positive": [""], "negative": [""] },
    "warnings": [""],
    "next_week_actions": { "continue": [""], "adjust": [""] }
  }
}
每个数组 1-5 项，简洁专业。`,
        user: context,
        useJson: true,
      };
    }
    return {
      system: `你是一个面向销售/区域经理的周盘分析助手。本周管理重心偏向：人员管理型。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "B",
  "state_label": "人员管理型",
  "sections": {
    "team_interactions": { "outstanding": [""], "needs_attention": [""] },
    "recurring_issues": [""],
    "management_signals": { "frequently_mentioned": [""], "ignored_risks": [""] },
    "next_week_actions": { "one_on_one": [""], "clarify_requirements": [""] }
  }
}
每个数组 1-5 项，简洁专业。`,
      user: context,
      useJson: true,
    };
  }

  if (userType === "creator") {
    return {
      system: `你是一个面向创作者的周盘分析助手。分析一周的创作记录，发现模式和灵感。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "creator",
  "sections": {
    "themes": ["反复出现的主题"],
    "best_ideas": ["最有发展潜力的灵感种子"],
    "connections": ["不同记录之间的意外联系"],
    "creative_momentum": "一句话评估创作能量",
    "next_week_focus": ["基于趋势建议的关注方向"]
  }
}`,
      user: context,
      useJson: true,
    };
  }

  return {
    system: "你是一个周报生成助手，风格简洁专业。",
    user: `请根据以下本周记录生成一份简短的中文周报总结（100-200字）。\n\n${context}\n\n请总结本周的主要活动、进展和值得关注的要点。`,
    useJson: false,
  };
}

function buildMonthlyPrompt(userType: string | null, context: string): { system: string; user: string; useJson: boolean } {
  if (userType === "manager") {
    return {
      system: "你是一个面向销售/区域经理的月度总结助手。请生成月度业绩回顾，包含趋势分析和下月重点（200-400字纯文本）。",
      user: context,
      useJson: false,
    };
  }
  if (userType === "creator") {
    return {
      system: "你是一个面向创作者的月度总结助手。请总结月度主题、作品进展和创作方向（200-400字纯文本）。",
      user: context,
      useJson: false,
    };
  }
  return {
    system: "你是一个月报生成助手。请生成简洁的月度总结（200-400字纯文本）。",
    user: `请根据以下本月记录生成总结：\n\n${context}`,
    useJson: false,
  };
}

function buildYearlyPrompt(userType: string | null, context: string): { system: string; user: string; useJson: boolean } {
  if (userType === "manager") {
    return {
      system: "你是一个面向销售/区域经理的年度总结助手。请生成年度总结，回顾业绩表现、关键节点和成长（200-400字纯文本）。",
      user: context,
      useJson: false,
    };
  }
  if (userType === "creator") {
    return {
      system: "你是一个面向创作者的年度总结助手。请总结年度创作轨迹、代表作品和成长（200-400字纯文本）。",
      user: context,
      useJson: false,
    };
  }
  return {
    system: "你是一个年报生成助手。请生成简洁的年度总结（200-400字纯文本）。",
    user: `请根据以下年度记录生成总结：\n\n${context}`,
    useJson: false,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateReviewPayload;

    if (!body.device_id || !body.period || !body.period_start || !body.period_end) {
      return new Response(
        JSON.stringify({ error: "device_id, period, period_start, period_end are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiUrl = Deno.env.get("OPENAI_URL") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };

    const rangeStart = `${body.period_start}T00:00:00Z`;
    const rangeEnd = `${body.period_end}T23:59:59Z`;

    // 1. Fetch user_type
    const deviceRes = await fetch(
      `${supabaseUrl}/rest/v1/device?id=eq.${body.device_id}&select=user_type`,
      { headers },
    );
    const deviceData = await deviceRes.json();
    const userType: string | null = Array.isArray(deviceData) ? deviceData[0]?.user_type ?? null : null;

    // 2. Fetch records with summaries
    const recordsRes = await fetch(
      `${supabaseUrl}/rest/v1/record?device_id=eq.${body.device_id}&status=eq.completed&created_at=gte.${rangeStart}&created_at=lte.${rangeEnd}&select=id,created_at,summary(title,short_summary),transcript(text)`,
      { headers },
    );
    const records = await recordsRes.json();

    // 3. Fetch todos
    const todosRes = await fetch(
      `${supabaseUrl}/rest/v1/todo?created_at=gte.${rangeStart}&created_at=lte.${rangeEnd}&select=id,text,done,record!inner(device_id)`,
      { headers },
    );
    const allTodos = await todosRes.json();
    const todos = Array.isArray(allTodos)
      ? allTodos.filter((t: any) => {
          const rec = Array.isArray(t.record) ? t.record[0] : t.record;
          return rec?.device_id === body.device_id;
        })
      : [];

    // 4. Fetch ideas
    const ideasRes = await fetch(
      `${supabaseUrl}/rest/v1/idea?created_at=gte.${rangeStart}&created_at=lte.${rangeEnd}&select=id,text,record!inner(device_id)`,
      { headers },
    );
    const allIdeas = await ideasRes.json();
    const ideas = Array.isArray(allIdeas)
      ? allIdeas.filter((i: any) => {
          const rec = Array.isArray(i.record) ? i.record[0] : i.record;
          return rec?.device_id === body.device_id;
        })
      : [];

    const stats = {
      total_records: Array.isArray(records) ? records.length : 0,
      total_todos: todos.length,
      completed_todos: todos.filter((t: any) => t.done).length,
      total_ideas: ideas.length,
    };

    // 5. Build context text
    const summaries = Array.isArray(records)
      ? records
          .map((r: any) => {
            const s = Array.isArray(r.summary) ? r.summary[0] : r.summary;
            const tr = Array.isArray(r.transcript) ? r.transcript[0] : r.transcript;
            const title = s?.title ?? "无标题";
            const content = tr?.text ?? s?.short_summary ?? "";
            return `${title}: ${content.slice(0, 200)}`;
          })
          .filter(Boolean)
      : [];

    const todoTexts = todos.map((t: any) => `${t.done ? "[完成]" : "[待办]"} ${t.text}`);
    const ideaTexts = ideas.map((i: any) => i.text);

    const contextText = `记录：\n${summaries.join("\n") || "无"}\n\n待办：\n${todoTexts.join("\n") || "无"}\n\n想法：\n${ideaTexts.join("\n") || "无"}\n\n统计：${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。`;

    let reviewSummary = "";
    let structuredData: Record<string, unknown> | null = null;

    if (summaries.length > 0 && openaiUrl && openaiKey) {
      const allText = summaries.join(" ") + " " + todoTexts.join(" ") + " " + ideaTexts.join(" ");

      let prompt: { system: string; user: string; useJson: boolean };

      switch (body.period) {
        case "daily":
          prompt = buildDailyPrompt(userType, contextText);
          break;
        case "weekly":
          prompt = buildWeeklyPrompt(userType, contextText, allText);
          break;
        case "monthly":
          prompt = buildMonthlyPrompt(userType, contextText);
          break;
        case "yearly":
          prompt = buildYearlyPrompt(userType, contextText);
          break;
      }

      const aiRes = await fetch(`${openaiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [
            { role: "system", content: prompt.system },
            { role: "user", content: prompt.user },
          ],
          ...(prompt.useJson ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        const content = aiJson.choices?.[0]?.message?.content ?? "";

        if (prompt.useJson) {
          try {
            structuredData = JSON.parse(content);
            // Generate text summary from structured data
            if (userType === "manager") {
              const sd = structuredData as any;
              reviewSummary = `【${sd?.state_label ?? "管理周盘"}】${contextText.slice(0, 100)}...`;
            } else {
              const sd = structuredData as any;
              reviewSummary = sd?.sections?.creative_momentum ?? content.slice(0, 200);
            }
          } catch {
            reviewSummary = content;
          }
        } else {
          reviewSummary = content;
        }
      }
    } else {
      reviewSummary = `共${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。`;
    }

    // 6. Upsert to review table
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/review?on_conflict=device_id,period,period_start`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          device_id: body.device_id,
          period: body.period,
          period_start: body.period_start,
          period_end: body.period_end,
          summary: reviewSummary,
          stats,
          structured_data: structuredData,
        }),
      },
    );

    const result = await upsertRes.json();

    return new Response(JSON.stringify({ ok: true, review: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
