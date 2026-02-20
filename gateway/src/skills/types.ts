export interface SkillMetadata {
  extract_fields?: string[];
  always?: boolean;
}

export interface Skill {
  name: string;
  description: string;
  prompt: string;
  enabled: boolean;
  metadata: SkillMetadata;
}

export interface SkillConfig {
  skill_name: string;
  enabled: boolean;
  config: Record<string, unknown>;
}
