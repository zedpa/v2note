import type { Skill } from "./types.js";
/**
 * Build the system prompt by combining active skills, memory, and soul.
 */
export declare function buildSystemPrompt(opts: {
    skills: Skill[];
    soul?: string;
    memory?: string[];
    mode?: "process" | "chat";
}): string;
