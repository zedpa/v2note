import { api } from "../api";

export async function listSkills(): Promise<any[]> {
  return api.get("/api/v1/skills");
}

export async function getSkillDetail(name: string): Promise<{
  name: string;
  description: string;
  prompt: string;
  always: boolean;
  enabled: boolean;
}> {
  return api.get(`/api/v1/skills/${name}`);
}

export async function toggleSkill(
  name: string,
  enabled: boolean,
): Promise<void> {
  await api.patch(`/api/v1/skills/${name}`, { enabled });
}
