import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** 本地日期提取（Asia/Shanghai UTC+8） */
function toShanghaiDateStr(d: Date): string {
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const shanghai = new Date(utc + 8 * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${shanghai.getFullYear()}-${pad(shanghai.getMonth() + 1)}-${pad(shanghai.getDate())}`;
}

interface GenerateSummaryPayload {
  device_id: string;
  period: "daily" | "weekly" | "monthly" | "yearly";
  date?: string; // ISO date string, defaults to today/this week/this month/this year
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as GenerateSummaryPayload;

    if (!body.device_id || !body.period) {
      return new Response(
        JSON.stringify({ error: "device_id and period are required" }),
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

    // Calculate date range
    const now = body.date ? new Date(body.date) : new Date();
    let rangeStart: string;
    let rangeEnd: string;
    let periodLabel: string;

    if (body.period === "daily") {
      const dateStr = toShanghaiDateStr(now);
      rangeStart = `${dateStr}T00:00:00+08:00`;
      rangeEnd = `${dateStr}T23:59:59+08:00`;
      periodLabel = `${now.getMonth() + 1}月${now.getDate()}日日报`;
    } else if (body.period === "weekly") {
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      rangeStart = `${toShanghaiDateStr(monday)}T00:00:00+08:00`;
      rangeEnd = `${toShanghaiDateStr(sunday)}T23:59:59+08:00`;
      periodLabel = `${monday.getMonth() + 1}.${monday.getDate()} - ${sunday.getMonth() + 1}.${sunday.getDate()} 周报`;
    } else if (body.period === "monthly") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      rangeStart = `${toShanghaiDateStr(firstDay)}T00:00:00+08:00`;
      rangeEnd = `${toShanghaiDateStr(lastDay)}T23:59:59+08:00`;
      periodLabel = `${now.getFullYear()}年${now.getMonth() + 1}月月报`;
    } else {
      // yearly
      rangeStart = `${now.getFullYear()}-01-01T00:00:00Z`;
      rangeEnd = `${now.getFullYear()}-12-31T23:59:59Z`;
      periodLabel = `${now.getFullYear()}年年报`;
    }

    // Fetch records
    const recordsRes = await fetch(
      `${supabaseUrl}/rest/v1/record?device_id=eq.${body.device_id}&status=eq.completed&created_at=gte.${rangeStart}&created_at=lte.${rangeEnd}&select=id,created_at,summary(title,short_summary)`,
      { headers },
    );
    const records = await recordsRes.json();

    const summaries = Array.isArray(records)
      ? records
          .map((r: any) => {
            const s = Array.isArray(r.summary) ? r.summary[0] : r.summary;
            return s ? `${s.title}: ${s.short_summary}` : null;
          })
          .filter(Boolean)
      : [];

    if (summaries.length === 0) {
      return new Response(
        JSON.stringify({ summary: null, message: "No records for this period" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Generate AI summary
    const periodMap: Record<string, string> = { daily: "日报", weekly: "周报", monthly: "月报", yearly: "年报" };
    const prompt = `请根据以下记录生成一份${periodMap[body.period]}总结（100-200字）。

记录：
${summaries.join("\n")}

请简洁概括主要内容和亮点。`;

    let generatedSummary = "";

    if (openaiUrl && openaiKey) {
      const aiRes = await fetch(`${openaiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "qwen-plus",
          messages: [
            { role: "system", content: "你是一个简洁的总结助手。" },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (aiRes.ok) {
        const aiJson = await aiRes.json();
        generatedSummary = aiJson.choices?.[0]?.message?.content ?? "";
      }
    }

    return new Response(
      JSON.stringify({
        period: body.period,
        label: periodLabel,
        record_count: summaries.length,
        summary: generatedSummary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
