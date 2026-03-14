import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { Skill } from "./types.js";

/**
 * Load all SKILL.md files from a directory.
 * Each skill lives in a subdirectory with a SKILL.md file.
 * Works for both skills/ and insights/ directories.
 */
export function loadSkills(dir: string): Skill[] {
  if (!existsSync(dir)) return [];

  const skills: Skill[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(dir, entry.name, "SKILL.md");
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
        always: data.metadata?.openclaw?.always ?? data.always ?? false,
        version: data.version,
        trigger: data.trigger,
        rag_required: data.rag_required,
      },
    });
  }

  return skills;
}

/**
 * Merge built-in skills with custom skills from local config.
 * Custom skills carry their own prompt and builtin: false in config.
 */
export function mergeWithCustomSkills(
  builtinSkills: Skill[],
  customConfigs?: Array<{
    name: string;
    enabled: boolean;
    description?: string;
    prompt?: string;
    builtin?: boolean;
  }>,
): Skill[] {
  if (!customConfigs) return builtinSkills;

  const merged = [...builtinSkills];
  const builtinNames = new Set(builtinSkills.map((s) => s.name));

  for (const cfg of customConfigs) {
    if (builtinNames.has(cfg.name)) continue;
    if (cfg.builtin !== false) continue;
    if (!cfg.prompt) continue;

    merged.push({
      name: cfg.name,
      description: cfg.description ?? "",
      prompt: cfg.prompt,
      enabled: cfg.enabled,
      metadata: {},
    });
  }

  return merged;
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
