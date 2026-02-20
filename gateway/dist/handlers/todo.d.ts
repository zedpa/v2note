export interface TodoAggregateResult {
    diary_entry: string;
}
/**
 * Aggregate all pending todos for a device into a formatted diary entry.
 */
export declare function aggregateTodos(deviceId: string): Promise<TodoAggregateResult>;
