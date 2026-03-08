import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { Skill, SkillType } from "./types.js";

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

    // Determine type: explicit > inferred from extract_fields
    const extractFields = data.metadata?.openclaw?.extract_fields;
    const explicitType = data.type as SkillType | undefined;
    const inferredType: SkillType =
      explicitType ?? (extractFields && extractFields.length > 0 ? "process" : "review");

    skills.push({
      name: data.name ?? entry.name,
      description: data.description ?? "",
      prompt: content.trim(),
      enabled: true,
      metadata: {
        extract_fields: extractFields,
        always: data.metadata?.openclaw?.always ?? false,
        type: inferredType,
        builtin: true,
      },
    });
  }

  return skills;
}

/**
 * Merge built-in skills with custom skills from local config.
 * Custom skills carry their own prompt, type, and builtin: false.
 */
export function mergeWithCustomSkills(
  builtinSkills: Skill[],
  customConfigs?: Array<{
    name: string;
    enabled: boolean;
    description?: string;
    type?: SkillType;
    prompt?: string;
    builtin?: boolean;
  }>,
): Skill[] {
  if (!customConfigs) return builtinSkills;

  const merged = [...builtinSkills];
  const builtinNames = new Set(builtinSkills.map((s) => s.name));

  for (const cfg of customConfigs) {
    if (builtinNames.has(cfg.name)) continue; // skip duplicates of builtin names
    if (cfg.builtin !== false) continue; // only add non-builtin custom skills
    if (!cfg.prompt) continue; // custom skills must have a prompt

    merged.push({
      name: cfg.name,
      description: cfg.description ?? "",
      prompt: cfg.prompt,
      enabled: cfg.enabled,
      metadata: {
        type: cfg.type ?? "review",
        builtin: false,
      },
    });
  }

  return merged;
}

/**
 * Generate a compact skill manifest for metadata-only injection.
 * Only names + descriptions, no full prompt text.
 * This goes into the hot tier to give the AI awareness of capabilities
 * without consuming tokens on full instructions.
 */
export function getSkillManifest(skills: Skill[]): string {
  return skills
    .map((s) => {
      const fields = s.metadata.extract_fields;
      const fieldHint = fields?.length ? ` [提取: ${fields.join(", ")}]` : "";
      return `- ${s.name}: ${s.description}${fieldHint}`;
    })
    .join("\n");
}

/**
 * Determine which skills need full prompt text vs metadata-only,
 * based on whether the input text contains relevant keywords.
 */
export function partitionSkillsByRelevance(
  skills: Skill[],
  inputText?: string,
): { fullText: Skill[]; metadataOnly: Skill[] } {
  if (!inputText) {
    // No input — include all as full text (safe fallback)
    return { fullText: skills, metadataOnly: [] };
  }

  const inputLower = inputText.toLowerCase();
  const fullText: Skill[] = [];
  const metadataOnly: Skill[] = [];

  for (const skill of skills) {
    // Skills with always=true always get full text
    if (skill.metadata.always) {
      fullText.push(skill);
      continue;
    }

    // Check if input contains keywords from skill description or name
    const keywords = [
      skill.name,
      ...skill.description.split(/[\s,，。]+/).filter((w) => w.length >= 2),
    ];
    const isRelevant = keywords.some((kw) => inputLower.includes(kw.toLowerCase()));

    if (isRelevant) {
      fullText.push(skill);
    } else {
      metadataOnly.push(skill);
    }
  }

  return { fullText, metadataOnly };
}

/**
 * Filter skills by enabled status and device-specific config.
 * Optionally filter by skill type.
 */
export function filterActiveSkills(
  skills: Skill[],
  deviceConfig?: Array<{ skill_name: string; enabled: boolean }>,
  type?: SkillType,
): Skill[] {
  let filtered = skills;

  // Filter by type if specified
  if (type) {
    filtered = filtered.filter((s) => s.metadata.type === type);
  }

  if (!deviceConfig) return filtered.filter((s) => s.enabled);

  return filtered.filter((s) => {
    const cfg = deviceConfig.find((c) => c.skill_name === s.name);
    return cfg ? cfg.enabled : s.enabled;
  });
}
