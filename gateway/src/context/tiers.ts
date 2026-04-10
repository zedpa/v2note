/**
 * Context tier definitions.
 *
 * v2: SharedAgent (static) + Soul/UserAgent/Profile/Memory/Wiki (dynamic per-user)
 * buildSystemPrompt 在 prompt-builder.ts 中直接组装，不再使用 ContextBuildOptions。
 */

export type ContextMode = "chat" | "briefing";

/** 角色化 Agent：briefing/onboarding 保留，chat 已由 Soul 替代 */
export type AgentRole = "chat" | "briefing" | "onboarding";
