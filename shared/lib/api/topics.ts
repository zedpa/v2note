import { api } from "../api";

export interface TopicItem {
  clusterId: string;
  title: string;
  memberCount: number;
  activeGoals: Array<{ id: string; title: string }>;
  lastActivity: string;
  intendDensity: number;
  hasActiveGoal: boolean;
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
    nucleus: string;
    polarity: string;
    created_at: string;
  }>;
  harvest: Array<{
    goal: { id: string; title: string; status: string };
    reviewStrike: { id: string; nucleus: string; polarity: string } | null;
    completedAt: string;
  }>;
}

export async function fetchTopics(): Promise<TopicItem[]> {
  return api.get("/api/v1/topics");
}

export async function fetchTopicLifecycle(clusterId: string): Promise<TopicLifecycle> {
  return api.get(`/api/v1/topics/${clusterId}/lifecycle`);
}

export async function harvestGoal(goalId: string): Promise<{ strikeId: string; nucleus: string }> {
  return api.post(`/api/v1/goals/${goalId}/harvest`, {});
}
