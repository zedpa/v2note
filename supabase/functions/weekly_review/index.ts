import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface WeeklyReviewPayload {
  device_id: string;
  week_start?: string; // ISO date, defaults to last Monday
  week_end?: string;
}

serve(async (req) => {
  try {
    const body = (await req.json().catch(() => ({}))) as WeeklyReviewPayload;

    if (!body.device_id) {
      return new Response(JSON.stringify({ error: "device_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
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

    // 1. Fetch records for the week
    const recordsRes = await fetch(
      `${supabaseUrl}/rest/v1/record?device_id=eq.${body.device_id}&status=eq.completed&created_at=gte.${weekStart}T00:00:00Z&created_at=lte.${weekEnd}T23:59:59Z&select=id,created_at,summary(title,short_summary)`,
      { headers },
    );
    const records = await recordsRes.json();

    // 2. Fetch todos for the week
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

    // 3. Fetch ideas for the week
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

    // 4. Build context for AI summary
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

    let reviewSummary = "";

    if (summaries.length > 0 && openaiUrl && openaiKey) {
      const prompt = `请根据以下本周记录生成一份简短的中文周报总结（100-200字）。

本周笔记：
${summaries.join("\n")}

本周待办：
${todoTexts.join("\n") || "无"}

本周想法：
${ideaTexts.join("\n") || "无"}

统计：${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。

请总结本周的主要活动、进展和值得关注的要点。`;

      const aiRes = await fetch(`${openaiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [
            { role: "system", content: "你是一个周报生成助手，风格简洁专业。" },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        reviewSummary = aiJson.choices?.[0]?.message?.content ?? "";
      }
    } else {
      reviewSummary = `本周共录制${stats.total_records}条笔记，${stats.total_todos}项待办（完成${stats.completed_todos}项），${stats.total_ideas}个想法。`;
    }

    // 5. Upsert weekly_review
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
        }),
      },
    );

    const result = await upsertRes.json();

    return new Response(JSON.stringify({ ok: true, review: result }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
