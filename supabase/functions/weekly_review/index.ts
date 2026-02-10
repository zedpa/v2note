import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface WeeklyReviewPayload {
  device_id: string;
  week_start?: string; // ISO date, defaults to last Monday
  week_end?: string;
}

// ── State detection for manager ──────────────────────────────────────────

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

function buildManagerPrompt(state: "A" | "B", context: string): { system: string; user: string } {
  if (state === "A") {
    return {
      system: `你是一个面向销售/区域经理的周盘分析助手。本周管理重心偏向：指标压力型。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "A",
  "state_label": "指标压力型",
  "sections": {
    "key_events": {
      "new_clients": ["新客户相关事件"],
      "existing_clients": ["存量客户相关事件"],
      "market_actions": ["市场动作"]
    },
    "impact_factors": {
      "positive": ["正向因素"],
      "negative": ["负向因素"]
    },
    "warnings": ["需要注意的风险或信号"],
    "next_week_actions": {
      "continue": ["继续做的事"],
      "adjust": ["需要调整的事"]
    }
  }
}
每个数组 1-5 项，简洁专业。`,
      user: context,
    };
  }

  return {
    system: `你是一个面向销售/区域经理的周盘分析助手。本周管理重心偏向：人员管理型。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "B",
  "state_label": "人员管理型",
  "sections": {
    "team_interactions": {
      "outstanding": ["表现突出的人/事"],
      "needs_attention": ["需要关注的人/事"]
    },
    "recurring_issues": ["反复出现的管理问题"],
    "management_signals": {
      "frequently_mentioned": ["频繁提到的关键词/人"],
      "ignored_risks": ["可能被忽略的风险"]
    },
    "next_week_actions": {
      "one_on_one": ["需要一对一沟通的人"],
      "clarify_requirements": ["需要明确的要求或规范"]
    }
  }
}
每个数组 1-5 项，简洁专业。`,
    user: context,
  };
}

function buildCreatorPrompt(context: string): { system: string; user: string } {
  return {
    system: `你是一个面向创作者的周盘分析助手。分析一周的创作记录，发现模式和灵感。
请返回严格 JSON（不要包含 markdown 代码块标记），格式如下：
{
  "state": "creator",
  "sections": {
    "themes": ["反复出现的主题（2-5个）"],
    "best_ideas": ["最有发展潜力的灵感种子（最多3个）"],
    "connections": ["不同记录之间的意外联系"],
    "creative_momentum": "一句话评估创作能量（如'活跃且发散'、'深度聚焦中'、'需要新刺激'）",
    "next_week_focus": ["基于趋势建议的关注方向（1-3个）"]
  }
}
themes: 跨记录模式识别；best_ideas: 选出最有发展潜力的种子；connections: 寻找看似无关记录之间的联系。`,
    user: context,
  };
}

function buildDefaultPrompt(context: string): { system: string; user: string } {
  return {
    system: "你是一个周报生成助手，风格简洁专业。",
    user: `请根据以下本周记录生成一份简短的中文周报总结（100-200字）。\n\n${context}\n\n请总结本周的主要活动、进展和值得关注的要点。`,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as WeeklyReviewPayload;

    if (!body.device_id) {
      return new Response(JSON.stringify({ error: "device_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiUrl = Deno.env.get("OPENAI_URL") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    // Calculate week range (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const lastMonday = new Date(now);
    lastMonday.setDate(now.getDate() - mondayOffset - 7);
    lastMonday.setHours(0, 0, 0, 0);
    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    const weekStart = body.week_start ?? lastMonday.toISOString().split("T")[0];
    const weekEnd = body.week_end ?? lastSunday.toISOString().split("T")[0];

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
    };

    // 1. Fetch user_type from device table
    const deviceRes = await fetch(
      `${supabaseUrl}/rest/v1/device?id=eq.${body.device_id}&select=user_type`,
      { headers },
    );
    const deviceData = await deviceRes.json();
    const userType: string | null = Array.isArray(deviceData) ? deviceData[0]?.user_type ?? null : null;

    // 2. Fetch records for the week
    const recordsRes = await fetch(
      `${supabaseUrl}/rest/v1/record?device_id=eq.${body.device_id}&status=eq.completed&created_at=gte.${weekStart}T00:00:00Z&created_at=lte.${weekEnd}T23:59:59Z&select=id,created_at,summary(title,short_summary)`,
      { headers },
    );
    const records = await recordsRes.json();

    // 3. Fetch todos for the week
    const todosRes = await fetch(
      `${supabaseUrl}/rest/v1/todo?created_at=gte.${weekStart}T00:00:00Z&created_at=lte.${weekEnd}T23:59:59Z&select=id,text,done,record!inner(device_id)`,
      { headers },
    );
    const allTodos = await todosRes.json();
    const todos = Array.isArray(allTodos)
      ? allTodos.filter((t: any) => {
          const rec = Array.isArray(t.record) ? t.record[0] : t.record;
          return rec?.device_id === body.device_id;
        })
      : [];

    // 4. Fetch ideas for the week
    const ideasRes = await fetch(
      `${supabaseUrl}/rest/v1/idea?created_at=gte.${weekStart}T00:00:00Z&created_at=lte.${weekEnd}T23:59:59Z&select=id,text,record!inner(device_id)`,
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

    // 5. Build context
    const summaries = Array.isArray(records)
      ? records
          .map((r: any) => {
            const s = Array.isArray(r.summary) ? r.summary[0] : r.summary;
            return s ? `${s.title}: ${s.short_summary}` : null;
          })
          .filter(Boolean)
      : [];

    const todoTexts = todos.map((t: any) => `${t.done ? "[完成]" : "[待办]"} ${t.text}`);
    const ideaTexts = ideas.map((i: any) => i.text);

    const contextText = `本周笔记：\n${summaries.join("\n") || "无"}\n\n本周待办：\n${todoTexts.join("\n") || "无"}\n\n本周想法：\n${ideaTexts.join("\n") || "无"}\n\n统计：${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。`;

    let reviewSummary = "";
    let structuredData: Record<string, unknown> | null = null;

    if (summaries.length > 0 && openaiUrl && openaiKey) {
      let promptPair: { system: string; user: string };
      const useStructured = userType === "manager" || userType === "creator";

      if (userType === "manager") {
        const allText = summaries.join(" ") + " " + todoTexts.join(" ") + " " + ideaTexts.join(" ");
        const state = detectManagerState(allText);
        promptPair = buildManagerPrompt(state, contextText);
      } else if (userType === "creator") {
        promptPair = buildCreatorPrompt(contextText);
      } else {
        promptPair = buildDefaultPrompt(contextText);
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
            { role: "system", content: promptPair.system },
            { role: "user", content: promptPair.user },
          ],
          ...(useStructured ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        const content = aiJson.choices?.[0]?.message?.content ?? "";

        if (useStructured) {
          try {
            structuredData = JSON.parse(content);
            // Generate a text summary from structured data for backward compat
            if (userType === "manager") {
              const sd = structuredData as any;
              const stateLabel = sd?.state_label ?? "管理周盘";
              reviewSummary = `【${stateLabel}】${contextText.slice(0, 100)}...`;
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
      reviewSummary = `本周共录制${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。`;
    }

    // 6. Upsert weekly_review
    const upsertRes = await fetch(
      `${supabaseUrl}/rest/v1/weekly_review?on_conflict=device_id,week_start`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({
          device_id: body.device_id,
          week_start: weekStart,
          week_end: weekEnd,
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
