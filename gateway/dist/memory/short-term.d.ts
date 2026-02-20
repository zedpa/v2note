/**
 * Short-term memory — stored in session context.
 * Automatically managed as part of conversation history.
 */
export interface ShortTermEntry {
    content: string;
    timestamp: Date;
}
export declare class ShortTermMemory {
    private entries;
    private maxEntries;
    add(content: string): void;
    getAll(): ShortTermEntry[];
    getSummary(): string;
    clear(): void;
}
