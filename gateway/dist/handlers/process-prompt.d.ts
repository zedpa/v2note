/**
 * Hardcoded process prompt for recording processing.
 *
 * Inlines all "must-run" extraction rules:
 * - Intent classification (task/wish/goal/complaint/reflection)
 * - Relay detection (source/target/direction)
 * - Transcript cleanup (de-colloquialization)
 * - Tag matching (existing tags only)
 * - Anti-hallucination discipline
 * - Fixed JSON output schema
 *
 * Optional skill prompts are appended after the core rules.
 */
export declare function buildProcessPrompt(opts: {
    existingTags?: string[];
    /** Optional skill prompt fragments (from enabled skills/ entries) */
    optionalSkillPrompts?: string[];
}): string;
