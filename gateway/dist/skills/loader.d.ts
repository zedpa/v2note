import type { Skill, SkillType } from "./types.js";
/**
 * Load all SKILL.md files from a directory.
 * Each skill lives in a subdirectory with a SKILL.md file.
 * The SKILL.md uses YAML frontmatter for metadata and markdown body as prompt.
 */
export declare function loadSkills(skillsDir: string): Skill[];
/**
 * Merge built-in skills with custom skills from local config.
 * Custom skills carry their own prompt, type, and builtin: false.
 */
export declare function mergeWithCustomSkills(builtinSkills: Skill[], customConfigs?: Array<{
    name: string;
    enabled: boolean;
    description?: string;
    type?: SkillType;
    prompt?: string;
    builtin?: boolean;
}>): Skill[];
/**
 * Generate a compact skill manifest for metadata-only injection.
 * Only names + descriptions, no full prompt text.
 * This goes into the hot tier to give the AI awareness of capabilities
 * without consuming tokens on full instructions.
 */
export declare function getSkillManifest(skills: Skill[]): string;
/**
 * Determine which skills need full prompt text vs metadata-only,
 * based on whether the input text contains relevant keywords.
 */
export declare function partitionSkillsByRelevance(skills: Skill[], inputText?: string): {
    fullText: Skill[];
    metadataOnly: Skill[];
};
/**
 * Filter skills by enabled status and device-specific config.
 * Optionally filter by skill type.
 */
export declare function filterActiveSkills(skills: Skill[], deviceConfig?: Array<{
    skill_name: string;
    enabled: boolean;
}>, type?: SkillType): Skill[];
