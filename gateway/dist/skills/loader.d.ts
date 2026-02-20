import type { Skill } from "./types.js";
/**
 * Load all SKILL.md files from a directory.
 * Each skill lives in a subdirectory with a SKILL.md file.
 * The SKILL.md uses YAML frontmatter for metadata and markdown body as prompt.
 */
export declare function loadSkills(skillsDir: string): Skill[];
/**
 * Filter skills by enabled status and device-specific config.
 */
export declare function filterActiveSkills(skills: Skill[], deviceConfig?: Array<{
    skill_name: string;
    enabled: boolean;
}>): Skill[];
