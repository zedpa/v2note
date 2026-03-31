/**
 * Context tier definitions for structured prompt assembly.
 *
 * Inspired by OpenClaw's approach:
 * - Hot: always in system prompt (core rules, anti-hallucination, output format)
 * - Warm: task-specific (soul, relevant memories, active skill prompts)
 */

import type { Skill } from "../skills/types.js";

export interface ContextTier {
  /** Always-present core rules + format. ~1500 chars. */
  hot: string;
  /** Task-specific additions. Varies by mode. */
  warm: string;
}

export type ContextMode = "chat" | "briefing";

/** 角色化 Agent：不同场景使用不同 agent 提示词 */
export type AgentRole = "chat" | "briefing" | "onboarding";

export interface ContextBuildOptions {
  mode: ContextMode;
  skills: Skill[];
  soul?: string;
  /** User profile (factual info, separated from soul) */
  userProfile?: string;
  memories?: string[];
  mcpTools?: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
  /** 角色化 Agent，决定注入哪个 agents/*.md */
  agent?: AgentRole;
}
