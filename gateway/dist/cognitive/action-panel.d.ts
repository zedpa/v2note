export interface ActionCard {
    strikeId: string;
    goalName: string;
    action: string;
    context?: string;
    actionType: "call" | "write" | "review" | "think" | "record";
    targetPerson?: string;
    durationEstimate?: "quick" | "medium" | "deep";
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
export declare function computeActionPanel(userId: string): Promise<ActionPanel>;
