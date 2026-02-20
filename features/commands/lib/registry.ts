import { parseCommand, parseDateRange } from "./parser";

export interface CommandContext {
  setTheme?: (theme: string) => void;
  exportData?: (format: string) => void;
  addTag?: (tag: string) => void;
  removeTag?: (tag: string) => void;
  startReview?: (dateRange: { start: string; end: string }) => void;
  aggregateTodos?: () => void;
  showHelp?: () => void;
  toggleSkill?: (name: string, enabled: boolean) => void;
}

export interface CommandResult {
  handled: boolean;
  message?: string;
}

type CommandHandler = (
  args: string[],
  ctx: CommandContext,
) => CommandResult;

const commands: Record<string, CommandHandler> = {
  theme: (args, ctx) => {
    const theme = args[0];
    if (!theme) return { handled: true, message: "用法: /theme dark|light|system" };
    ctx.setTheme?.(theme);
    return { handled: true, message: `主题已切换为 ${theme}` };
  },

  export: (args, ctx) => {
    const format = args[0] || "json";
    ctx.exportData?.(format);
    return { handled: true, message: `正在导出 ${format} 格式...` };
  },

  tag: (args, ctx) => {
    const [action, ...rest] = args;
    const name = rest.join(" ");
    if (action === "add" && name) {
      ctx.addTag?.(name);
      return { handled: true, message: `已添加标签: ${name}` };
    }
    if ((action === "remove" || action === "del") && name) {
      ctx.removeTag?.(name);
      return { handled: true, message: `已删除标签: ${name}` };
    }
    return { handled: true, message: "用法: /tag add 标签名 | /tag remove 标签名" };
  },

  todo: (_args, ctx) => {
    ctx.aggregateTodos?.();
    return { handled: true, message: "正在汇总待办..." };
  },

  review: (args, ctx) => {
    const range = parseDateRange(args);
    if (!range) {
      return { handled: true, message: "用法: /review 2月1日-2月14日 或 /review 上周" };
    }
    ctx.startReview?.(range);
    return { handled: true };
  },

  help: (_args, ctx) => {
    ctx.showHelp?.();
    return { handled: true };
  },

  skill: (args, ctx) => {
    const [name, state] = args;
    if (!name) return { handled: true, message: "用法: /skill 技能名 on|off" };
    ctx.toggleSkill?.(name, state !== "off");
    return { handled: true, message: `技能 ${name} 已${state === "off" ? "停用" : "启用"}` };
  },
};

/**
 * Execute a command string. Returns null if not a command.
 */
export function executeCommand(
  input: string,
  ctx: CommandContext,
): CommandResult | null {
  const parsed = parseCommand(input);
  if (!parsed) return null;

  const handler = commands[parsed.name];
  if (!handler) {
    return { handled: true, message: `未知命令: /${parsed.name}。输入 /help 查看帮助。` };
  }

  return handler(parsed.args, ctx);
}

/**
 * Get available command names for autocomplete.
 */
export function getCommandNames(): string[] {
  return Object.keys(commands);
}
