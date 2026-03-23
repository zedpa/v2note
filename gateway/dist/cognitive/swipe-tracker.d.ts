export interface SwipeEvent {
    userId: string;
    strikeId: string;
    direction: "left" | "right";
    reason?: "later" | "wait" | "blocked" | "rethink";
}
export declare function recordSwipe(event: SwipeEvent): Promise<void>;
