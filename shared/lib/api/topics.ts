import { api } from "../api";

export interface TopicItem {
  wikiPageId: string;
  title: string;
  recordCount: number;
  activeGoals: Array<{ id: string; title: string }>;
  lastActivity: string;
  hasActiveGoal: boolean;
  level: number;
  parentId: string | null;
}

export interface TopicLifecycle {
  now: Array<{
    id: string;
    text: string;
    done: boolean;
    scheduled_start?: string | null;
  }>;
  growing: Array<{
    goal: { id: string; title: string; status: string };
    todos: Array<{ id: string; text: string; done: boolean }>;
    completionPercent: number;
  }>;
  seeds: Array<{
    id: string;
    content: string;
    type: "section";
  }>;
  harvest: Array<{
    goal: { id: string; title: string; status: string };
    content: string;
    completedAt: string;
  }>;
}

export async function fetchTopics(): Promise<TopicItem[]> {
  return api.get("/api/v1/topics");
}

export async function fetchTopicLifecycle(wikiPageId: string): Promise<TopicLifecycle> {
  return api.get(`/api/v1/topics/${wikiPageId}/lifecycle`);
}

export async function harvestGoal(goalId: string): Promise<{ goalId: string; title: string; wikiPageId: string | null }> {
  return api.post(`/api/v1/goals/${goalId}/harvest`, {});
}
