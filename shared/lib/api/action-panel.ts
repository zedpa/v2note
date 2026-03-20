import { api } from "../api";

export interface ActionCard {
  strikeId: string;
  goalName: string;
  action: string;
  context?: string;
  actionType: string;
  targetPerson?: string;
  durationEstimate?: string;
  goalId: string;
}

export interface ActionItem {
  strikeId: string;
  text: string;
  goalName: string;
  symbol: "next" | "scheduled" | "flexible";
  scheduledTime?: string;
}

export interface GoalIndicator {
  goalId: string;
  goalName: string;
  actionCount: number;
}

export interface ActionPanel {
  now: ActionCard | null;
  today: ActionItem[];
  goals: GoalIndicator[];
}

export async function fetchActionPanel(): Promise<ActionPanel> {
  return api.get("/api/v1/action-panel");
}

export async function reportSwipe(data: {
  strikeId: string;
  direction: "left" | "right";
  reason?: string;
}): Promise<void> {
  await api.post("/api/v1/action-panel/swipe", data);
}
