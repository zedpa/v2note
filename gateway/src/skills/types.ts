export interface SkillMetadata {
  extract_fields?: string[];
  always?: boolean;
  /** Optional version string */
  version?: string;
  /** Trigger description for insight skills */
  trigger?: string;
  /** Whether RAG context is required */
  rag_required?: boolean;
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
