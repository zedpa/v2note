import { supabase } from "./supabase";
import { getDeviceId } from "./device";

export type ExportFormat = "json" | "csv" | "markdown";

interface ExportData {
  records: any[];
  todos: any[];
  ideas: any[];
}

async function fetchAllData(): Promise<ExportData> {
  const deviceId = await getDeviceId();

  const [recordsRes, todosRes, ideasRes] = await Promise.all([
    supabase
      .from("record")
      .select(`
        id, status, duration_seconds, location_text, created_at,
        transcript (text),
        summary (title, short_summary, long_summary),
        record_tag (tag:tag_id (name))
      `)
      .eq("device_id", deviceId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase
      .from("todo")
      .select("id, text, done, created_at, record:record_id (device_id)")
      .order("created_at", { ascending: false }),
    supabase
      .from("idea")
      .select("id, text, created_at, record:record_id (device_id)")
      .order("created_at", { ascending: false }),
  ]);

  const records = recordsRes.data ?? [];
  const todos = (todosRes.data ?? []).filter((t: any) => {
    const rec = Array.isArray(t.record) ? t.record[0] : t.record;
    return rec?.device_id === deviceId;
  });
  const ideas = (ideasRes.data ?? []).filter((i: any) => {
    const rec = Array.isArray(i.record) ? i.record[0] : i.record;
    return rec?.device_id === deviceId;
  });

  return { records, todos, ideas };
}

function toJSON(data: ExportData): string {
  return JSON.stringify(data, null, 2);
}

function toCSV(data: ExportData): string {
  const lines: string[] = [];

  // Records
  lines.push("--- 笔记 ---");
  lines.push("日期,标题,摘要,标签,位置");
  for (const r of data.records) {
    const summary = Array.isArray(r.summary) ? r.summary[0] : r.summary;
    const tags = (r.record_tag ?? []).map((rt: any) => rt.tag?.name).filter(Boolean).join(";");
    const title = (summary?.title ?? "").replace(/,/g, "，");
    const desc = (summary?.short_summary ?? "").replace(/,/g, "，");
    const loc = (r.location_text ?? "").replace(/,/g, "，");
    lines.push(`${r.created_at},${title},${desc},${tags},${loc}`);
  }

  // Todos
  lines.push("");
  lines.push("--- 待办 ---");
  lines.push("日期,内容,完成");
  for (const t of data.todos) {
    lines.push(`${t.created_at},${t.text.replace(/,/g, "，")},${t.done ? "是" : "否"}`);
  }

  // Ideas
  lines.push("");
  lines.push("--- 想法 ---");
  lines.push("日期,内容");
  for (const i of data.ideas) {
    lines.push(`${i.created_at},${i.text.replace(/,/g, "，")}`);
  }

  return lines.join("\n");
}

function toMarkdown(data: ExportData): string {
  const lines: string[] = [];

  lines.push("# VoiceNote 数据导出\n");
  lines.push(`导出时间：${new Date().toLocaleString("zh-CN")}\n`);

  lines.push("## 笔记\n");
  for (const r of data.records) {
    const summary = Array.isArray(r.summary) ? r.summary[0] : r.summary;
    const transcript = Array.isArray(r.transcript) ? r.transcript[0] : r.transcript;
    const tags = (r.record_tag ?? []).map((rt: any) => rt.tag?.name).filter(Boolean);

    lines.push(`### ${summary?.title ?? "未命名"}\n`);
    lines.push(`- **日期**: ${new Date(r.created_at).toLocaleString("zh-CN")}`);
    if (r.location_text) lines.push(`- **位置**: ${r.location_text}`);
    if (tags.length > 0) lines.push(`- **标签**: ${tags.join(", ")}`);
    lines.push("");
    if (summary?.short_summary) lines.push(`> ${summary.short_summary}\n`);
    if (transcript?.text) lines.push(`${transcript.text}\n`);
    lines.push("---\n");
  }

  if (data.todos.length > 0) {
    lines.push("## 待办事项\n");
    for (const t of data.todos) {
      lines.push(`- [${t.done ? "x" : " "}] ${t.text}`);
    }
    lines.push("");
  }

  if (data.ideas.length > 0) {
    lines.push("## 想法与灵感\n");
    for (const i of data.ideas) {
      lines.push(`- ${i.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function exportData(format: ExportFormat): Promise<{ content: string; filename: string; mimeType: string }> {
  const data = await fetchAllData();

  switch (format) {
    case "json":
      return {
        content: toJSON(data),
        filename: `voicenote-export-${Date.now()}.json`,
        mimeType: "application/json",
      };
    case "csv":
      return {
        content: toCSV(data),
        filename: `voicenote-export-${Date.now()}.csv`,
        mimeType: "text/csv",
      };
    case "markdown":
      return {
        content: toMarkdown(data),
        filename: `voicenote-export-${Date.now()}.md`,
        mimeType: "text/markdown",
      };
  }
}

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
