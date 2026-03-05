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
  type: "review" | "process";
  builtin: boolean;
}> {
  return api.get(`/api/v1/skills/${name}`);
}

export async function toggleSkill(
  name: string,
  enabled: boolean,
): Promise<void> {
  await api.patch(`/api/v1/skills/${name}`, { enabled });
}

export async function createSkill(fields: {
  name: string;
  description?: string;
  prompt: string;
  type?: "review" | "process";
}): Promise<any> {
  return api.post("/api/v1/skills", fields);
}

export async function updateSkill(
  name: string,
  fields: {
    name?: string;
    description?: string;
    prompt?: string;
    type?: "review" | "process";
    enabled?: boolean;
  },
): Promise<void> {
  await api.put(`/api/v1/skills/${name}`, fields);
}

export async function deleteSkill(name: string): Promise<void> {
  await api.delete(`/api/v1/skills/${name}`);
}
