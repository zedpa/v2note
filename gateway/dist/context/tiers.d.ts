/**
 * Context tier definitions for structured prompt assembly.
 *
 * Inspired by OpenClaw's approach:
 * - Hot: always in system prompt (core rules, anti-hallucination, output format)
 * - Warm: task-specific (soul, relevant memories, active skill prompts)
 * - Cold: on-demand (full memory history, skill details, tool param schemas)
 */
import type { Skill } from "../skills/types.js";
export interface ContextTier {
    /** Always-present core rules + format. ~1500 chars. */
    hot: string;
    /** Task-specific additions. Varies by mode. */
    warm: string;
    /** Available but not injected into system prompt. */
    cold: string[];
}
export type ContextMode = "process" | "chat" | "briefing" | "estimate";
export interface ContextBuildOptions {
    mode: ContextMode;
    skills: Skill[];
    soul?: string;
    memories?: string[];
    existingTags?: string[];
    mcpTools?: Array<{
        name: string;
        description: string;
        parameters?: Record<string, unknown>;
    }>;
    /** Input text for relevance-based filtering */
    inputText?: string;
}
