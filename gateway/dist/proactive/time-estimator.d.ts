/**
 * AI-powered time estimation for todos.
 * Uses the AI provider to estimate completion time and suggest scheduling.
 */
export interface TimeEstimate {
    estimated_minutes: number;
    priority: number;
    suggested_start?: string;
    suggested_end?: string;
    reasoning?: string;
}
/**
 * Estimate time and priority for a todo item.
 */
export declare function estimateTodoTime(todoText: string, context?: {
    soul?: string;
    existingTodos?: string[];
}): Promise<TimeEstimate>;
/**
 * Estimate time for multiple todos in a single AI call.
 */
export declare function estimateBatchTodos(todos: Array<{
    id: string;
    text: string;
}>, context?: {
    soul?: string;
}): Promise<Map<string, TimeEstimate>>;
