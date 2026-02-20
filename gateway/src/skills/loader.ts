import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { Skill } from "./types.js";

/**
 * Load all SKILL.md files from a directory.
 * Each skill lives in a subdirectory with a SKILL.md file.
 * The SKILL.md uses YAML frontmatter for metadata and markdown body as prompt.
 */
export function loadSkills(skillsDir: string): Skill[] {
  if (!existsSync(skillsDir)) return [];

  const skills: Skill[] = [];
  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    const raw = readFileSync(skillPath, "utf-8");
    const { data, content } = matter(raw);

    skills.push({
      name: data.name ?? entry.name,
      description: data.description ?? "",
      prompt: content.trim(),
      enabled: true,
      metadata: {
        extract_fields: data.metadata?.openclaw?.extract_fields,
        always: data.metadata?.openclaw?.always ?? false,
      },
    });
  }

  return skills;
}

/**
 * Filter skills by enabled status and device-specific config.
 */
export function filterActiveSkills(
  skills: Skill[],
  deviceConfig?: Array<{ skill_name: string; enabled: boolean }>,
): Skill[] {
  if (!deviceConfig) return skills.filter((s) => s.enabled);

  return skills.filter((s) => {
    const cfg = deviceConfig.find((c) => c.skill_name === s.name);
    return cfg ? cfg.enabled : s.enabled;
  });
}
