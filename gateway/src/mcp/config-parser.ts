/**
 * Parse MCP server configurations from Tools config (local or markdown).
 */

import type { MCPServerConfig } from "./client.js";

interface ToolsConfig {
  servers: Array<{
    name: string;
    transport: "stdio" | "http";
    command?: string;
    args?: string[];
    url?: string;
    description?: string;
    enabled: boolean;
  }>;
}

/**
 * Parse MCP server configs from a Tools JSON config object.
 */
export function parseToolsConfig(config: ToolsConfig | null): MCPServerConfig[] {
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
export function parseToolsMarkdown(markdown: string): MCPServerConfig[] {
  const jsonMatch = markdown.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((s: any) => s.name && s.transport)
        .map((s: any) => ({
          name: s.name,
          transport: s.transport as "stdio" | "http",
          command: s.command,
          args: s.args,
          url: s.url,
          description: s.description,
          enabled: s.enabled ?? true,
        }));
    }
  } catch {
    console.warn("[mcp-config] Failed to parse Tools.md JSON block");
  }

  return [];
}

/**
 * Parse MCP server configs from localConfig payload.
 */
export function parseLocalConfigTools(
  localConfig?: { tools?: { servers: Array<Record<string, unknown>> } },
): MCPServerConfig[] {
  if (!localConfig?.tools?.servers) return [];

  return localConfig.tools.servers
    .filter((s: any) => s.name && s.transport)
    .map((s: any) => ({
      name: s.name,
      transport: s.transport as "stdio" | "http",
      command: s.command,
      args: s.args,
      url: s.url,
      description: s.description,
      enabled: s.enabled ?? true,
    }));
}
