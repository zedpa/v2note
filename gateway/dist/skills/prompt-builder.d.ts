import type { Skill } from "./types.js";
import type { ContextTier, ContextBuildOptions } from "../context/tiers.js";
/**
 * Build tiered context for structured prompt assembly.
 *
 * Hot tier (~1500 chars): core rules, anti-hallucination, output format skeleton
 * Warm tier (variable): soul, relevant memories, active skill prompts
 * Cold tier: remaining context available on-demand
 */
export declare function buildTieredContext(opts: ContextBuildOptions): ContextTier;
/**
 * Build the system prompt by combining active skills, memory, and soul.
 * Backward-compatible wrapper that concatenates hot + warm tiers.
 */
export declare function buildSystemPrompt(opts: {
    skills: Skill[];
    soul?: string;
    memory?: string[];
    mode?: "process" | "chat";
    existingTags?: string[];
    mcpTools?: Array<{
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    }>;
    /** Input text for relevance-based skill filtering */
    inputText?: string;
}): string;
