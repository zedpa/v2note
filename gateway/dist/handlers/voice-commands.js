/**
 * Voice command matching — detects command patterns in ASR transcripts.
 */
const COMMANDS = [
    { name: "todos", aliases: ["todo", "待办"] },
    { name: "today-todo", aliases: ["今日", "today", "今日任务", "今天任务"] },
    { name: "settings", aliases: ["设置"] },
    { name: "review", aliases: ["复盘"] },
    { name: "search", aliases: ["搜索"] },
    { name: "skills", aliases: ["技能"] },
    { name: "stats", aliases: ["统计"] },
    { name: "help", aliases: ["帮助"] },
    { name: "theme", aliases: ["主题"] },
    { name: "export", aliases: ["导出"] },
    { name: "profile", aliases: ["画像"] },
    { name: "ideas", aliases: ["灵感"] },
    { name: "memory", aliases: ["记忆"] },
];
const PREFIXES = ["打开", "显示", "查看", "进入", "开始"];
/**
 * Match a voice transcript against known command patterns.
 * Short transcripts (< 10 chars) are checked for command matches.
 */
export function matchVoiceCommand(text) {
    const normalized = text.trim();
    // Only try to match short transcripts (likely to be commands)
    if (normalized.length > 15)
        return null;
    const lower = normalized.toLowerCase();
    // Direct alias match
    for (const cmd of COMMANDS) {
        if (lower === cmd.name) {
            return { command: cmd.name, args: [] };
        }
        for (const alias of cmd.aliases) {
            if (lower === alias.toLowerCase()) {
                return { command: cmd.name, args: [] };
            }
        }
    }
    // Prefix match: "打开待办" → /todos
    for (const prefix of PREFIXES) {
        if (lower.startsWith(prefix)) {
            const rest = lower.slice(prefix.length);
            for (const cmd of COMMANDS) {
                for (const alias of cmd.aliases) {
                    if (rest === alias.toLowerCase()) {
                        return { command: cmd.name, args: [] };
                    }
                }
                if (rest === cmd.name) {
                    return { command: cmd.name, args: [] };
                }
            }
        }
    }
    return null;
}
//# sourceMappingURL=voice-commands.js.map