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
export interface TodoEnrichment extends TimeEstimate {
    domain: string;
    impact: number;
    ai_actionable: boolean;
    ai_action_plan?: string[];
}
/**
 * Estimate time and priority for a todo item.
 */
export declare function estimateTodoTime(todoText: string, context?: {
    soul?: string;
    existingTodos?: string[];
}): Promise<TimeEstimate>;
/**
 * Estimate time, priority, domain, impact, and AI actionability for multiple todos.
 */
export declare function estimateBatchTodos(todos: Array<{
    id: string;
    text: string;
}>, context?: {
    soul?: string;
    memories?: string[];
}): Promise<Map<string, TodoEnrichment>>;
