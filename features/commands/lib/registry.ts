import { parseCommand, parseDateRange } from "./parser";
import commandDefs from "./commands.json";

export interface CommandDef {
  name: string;
  aliases: string[];
  description: string;
  category: "view" | "settings" | "action" | "system";
}

export interface CommandContext {
  setTheme?: (theme: string) => void;
  exportData?: (format: string) => void;
  startReview?: (dateRange: { start: string; end: string }) => void;
  showHelp?: () => void;
  openOverlay?: (name: string, args?: string[]) => void;
}

export interface CommandResult {
  handled: boolean;
  command?: string;
  args?: string[];
  message?: string;
}

// Load command definitions from JSON
const commands: CommandDef[] = commandDefs as CommandDef[];

// Build alias lookup map
const aliasMap = new Map<string, string>();
for (const cmd of commands) {
  aliasMap.set(cmd.name, cmd.name);
  for (const alias of cmd.aliases) {
    aliasMap.set(alias.toLowerCase(), cmd.name);
  }
}

/**
 * Resolve a command name or alias to the canonical command name.
 */
function resolveCommand(name: string): string | null {
  return aliasMap.get(name.toLowerCase()) ?? null;
}

/**
 * Execute a command string. Returns null if not a command.
 */
export function executeCommand(
  input: string,
  ctx: CommandContext,
): CommandResult | null {
  const parsed = parseCommand(input);
  if (!parsed) return null;

  const commandName = resolveCommand(parsed.name);
  if (!commandName) {
    return { handled: true, message: `未知命令: /${parsed.name}。输入 /help 查看帮助。` };
  }

  const def = commands.find((c) => c.name === commandName);
  if (!def) {
    return { handled: true, message: `未知命令: /${parsed.name}` };
  }

  // Handle special commands with inline logic
  switch (commandName) {
    case "theme": {
      const theme = parsed.args[0];
      if (!theme) return { handled: true, message: "用法: /theme dark|light|system" };
      ctx.setTheme?.(theme);
      return { handled: true, command: commandName, message: `主题已切换为 ${theme}` };
    }

    case "export": {
      const format = parsed.args[0] || "json";
      ctx.exportData?.(format);
      return { handled: true, command: commandName, message: `正在导出 ${format} 格式...` };
    }

    case "review": {
      const range = parseDateRange(parsed.args);
      if (!range) {
        return { handled: true, message: "用法: /review 2月1日-2月14日 或 /review 上周" };
      }
      ctx.startReview?.(range);
      return { handled: true, command: commandName };
    }

    case "help": {
      ctx.showHelp?.();
      return { handled: true, command: commandName };
    }

    // View commands → open overlay
    default: {
      if (def.category === "view") {
        ctx.openOverlay?.(commandName, parsed.args);
        return { handled: true, command: commandName };
      }
      // Fallback for unknown categories
      ctx.openOverlay?.(commandName, parsed.args);
      return { handled: true, command: commandName };
    }
  }
}

/**
 * Get all command definitions for autocomplete.
 */
export function getCommandDefs(): CommandDef[] {
  return commands;
}

/**
 * Get command names for autocomplete.
 */
export function getCommandNames(): string[] {
  return commands.map((c) => c.name);
}

/**
 * Match a voice text against command patterns.
 * Returns the matched command name or null.
 */
export function matchVoiceCommand(text: string): { command: string; args: string[] } | null {
  const normalized = text.trim().toLowerCase();

  // Direct alias match
  for (const cmd of commands) {
    for (const alias of cmd.aliases) {
      if (normalized === alias.toLowerCase() || normalized === `打开${alias.toLowerCase()}`) {
        return { command: cmd.name, args: [] };
      }
    }
    if (normalized === cmd.name || normalized === `打开${cmd.name}`) {
      return { command: cmd.name, args: [] };
    }
  }

  // Pattern match: "打开..." / "显示..." / "查看..."
  const prefixes = ["打开", "显示", "查看", "进入", "开始"];
  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      const rest = normalized.slice(prefix.length);
      for (const cmd of commands) {
        for (const alias of cmd.aliases) {
          if (rest === alias.toLowerCase()) {
            return { command: cmd.name, args: [] };
          }
        }
      }
    }
  }

  return null;
}
