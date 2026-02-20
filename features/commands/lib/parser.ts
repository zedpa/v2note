/**
 * Parse a command string like "/review 2月1日-2月14日" into command name + args.
 */
export interface ParsedCommand {
  name: string;
  args: string[];
  raw: string;
}

export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const parts = trimmed.slice(1).split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;

  return {
    name,
    args: parts.slice(1),
    raw: trimmed,
  };
}

/**
 * Parse a date range string like "2月1日-2月14日" or "2026-02-01-2026-02-14".
 */
export function parseDateRange(
  args: string[],
): { start: string; end: string } | null {
  const text = args.join(" ");
  if (!text) return null;

  // Try ISO format: 2026-02-01 to 2026-02-14
  const isoMatch = text.match(
    /(\d{4}-\d{2}-\d{2})\s*[-到至]\s*(\d{4}-\d{2}-\d{2})/,
  );
  if (isoMatch) {
    return { start: isoMatch[1], end: isoMatch[2] };
  }

  // Try Chinese format: 2月1日-2月14日
  const cnMatch = text.match(
    /(\d{1,2})月(\d{1,2})日?\s*[-到至]\s*(\d{1,2})月(\d{1,2})日?/,
  );
  if (cnMatch) {
    const year = new Date().getFullYear();
    const start = `${year}-${cnMatch[1].padStart(2, "0")}-${cnMatch[2].padStart(2, "0")}`;
    const end = `${year}-${cnMatch[3].padStart(2, "0")}-${cnMatch[4].padStart(2, "0")}`;
    return { start, end };
  }

  // Try relative: "上周", "本月", "昨天"
  const now = new Date();
  if (text.includes("昨天")) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const ds = formatDate(d);
    return { start: ds, end: ds };
  }
  if (text.includes("上周")) {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day - 6);
    const start = formatDate(d);
    d.setDate(d.getDate() + 6);
    const end = formatDate(d);
    return { start, end };
  }
  if (text.includes("本周")) {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    const start = formatDate(d);
    d.setDate(d.getDate() + 6);
    const end = formatDate(d);
    return { start, end };
  }
  if (text.includes("本月")) {
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const end = formatDate(now);
    return { start, end };
  }

  return null;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
