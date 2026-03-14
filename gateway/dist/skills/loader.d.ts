import type { Skill } from "./types.js";
/**
 * Load all SKILL.md files from a directory.
 * Each skill lives in a subdirectory with a SKILL.md file.
 * Works for both skills/ and insights/ directories.
 */
export declare function loadSkills(dir: string): Skill[];
/**
 * Merge built-in skills with custom skills from local config.
 * Custom skills carry their own prompt and builtin: false in config.
 */
export declare function mergeWithCustomSkills(builtinSkills: Skill[], customConfigs?: Array<{
    name: string;
    enabled: boolean;
    description?: string;
    prompt?: string;
    builtin?: boolean;
}>): Skill[];
/**
 * Filter skills by enabled status and device-specific config.
 */
export declare function filterActiveSkills(skills: Skill[], deviceConfig?: Array<{
    skill_name: string;
    enabled: boolean;
}>): Skill[];
