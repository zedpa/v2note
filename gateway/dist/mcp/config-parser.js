/**
 * Parse MCP server configurations from Tools config (local or markdown).
 */
/**
 * Parse MCP server configs from a Tools JSON config object.
 */
export function parseToolsConfig(config) {
    if (!config || !Array.isArray(config.servers)) {
        return [];
    }
    return config.servers
        .filter((s) => s.name && s.transport)
        .map((s) => ({
        name: s.name,
        transport: s.transport,
        command: s.command,
        args: s.args,
        url: s.url,
        description: s.description,
        enabled: s.enabled ?? true,
    }));
}
/**
 * Parse MCP server configs from a markdown string (Tools.md format).
 * Expected format:
 *
 * ```json
 * [{"name": "...", "transport": "...", ...}]
 * ```
 */
export function parseToolsMarkdown(markdown) {
    const jsonMatch = markdown.match(/```json\s*\n([\s\S]*?)\n\s*```/);
    if (!jsonMatch)
        return [];
    try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((s) => s.name && s.transport)
                .map((s) => ({
                name: s.name,
                transport: s.transport,
                command: s.command,
                args: s.args,
                url: s.url,
                description: s.description,
                enabled: s.enabled ?? true,
            }));
        }
    }
    catch {
        console.warn("[mcp-config] Failed to parse Tools.md JSON block");
    }
    return [];
}
/**
 * Parse MCP server configs from localConfig payload.
 */
export function parseLocalConfigTools(localConfig) {
    if (!localConfig?.tools?.servers)
        return [];
    return localConfig.tools.servers
        .filter((s) => s.name && s.transport)
        .map((s) => ({
        name: s.name,
        transport: s.transport,
        command: s.command,
        args: s.args,
        url: s.url,
        description: s.description,
        enabled: s.enabled ?? true,
    }));
}
//# sourceMappingURL=config-parser.js.map