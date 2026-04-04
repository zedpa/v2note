/**
 * Layer 1: 待办全能模式 AI Prompt
 *
 * 用户在待办页面录音时使用。单次 AI 调用提取：
 * - action_type: create / complete / modify / query
 * - 全量待办参数（text, time, reminder, priority, recurrence, goal_hint）
 */
export interface TodoModeContext {
    pendingTodos: Array<{
        id: string;
        text: string;
        scheduled_start?: string;
    }>;
    activeGoals: Array<{
        id: string;
        title: string;
    }>;
}
export declare function buildTodoExtractPrompt(ctx: TodoModeContext): string;
/**
 * 继续说话修改 prompt — 用户在确认弹窗中追加修改指令
 */
export declare function buildTodoRefinePrompt(currentCommands: unknown[], dateAnchor?: string): string;
