/**
 * Smart scheduler — suggests time slots for unscheduled todos.
 */
export interface ScheduleSlot {
    todoId: string;
    start: string;
    end: string;
}
export interface TodoForScheduling {
    id: string;
    text: string;
    estimated_minutes: number;
    priority: number;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
}
/**
 * Generate a suggested schedule for unscheduled todos.
 * Fills gaps in the day based on priority and estimated time.
 */
export declare function suggestSchedule(todos: TodoForScheduling[], date?: Date): ScheduleSlot[];
