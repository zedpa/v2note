import type { Skill } from "./types.js";
import type { ContextTier, ContextBuildOptions, AgentRole } from "../context/tiers.js";
/**
 * Build tiered context for chat/briefing prompt assembly.
 *
 * Hot tier (~1500 chars): core rules, anti-hallucination
 * Warm tier (variable): soul, profile, memories, skill prompts, tools
 */
export declare function buildTieredContext(opts: ContextBuildOptions): ContextTier;
/**
 * Build the system prompt by combining hot + warm tiers.
 * Serves chat and briefing modes only (process uses hardcoded prompt).
 */
export declare function buildSystemPrompt(opts: {
    skills: Skill[];
    soul?: string;
    userProfile?: string;
    memory?: string[];
    mode?: "chat" | "briefing";
    agent?: AgentRole;
    mcpTools?: Array<{
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    }>;
    /** Pre-built pending intent context to inject into warm tier */
    pendingIntentContext?: string;
    /** Cognitive engine context (contradictions, evolution) in natural language */
    cognitiveContext?: string;
}): string;
