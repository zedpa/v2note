/**
 * MemoryManager combines short-term (session) and long-term (Supabase) memory.
 */
export declare class MemoryManager {
    private shortTerm;
    /**
     * Load relevant memories for a session.
     */
    loadContext(deviceId: string, dateRange?: {
        start: string;
        end: string;
    }): Promise<string[]>;
    /**
     * Add to short-term memory.
     */
    addShortTerm(content: string): void;
    /**
     * After processing a record, use AI to decide if a long-term memory should be created.
     */
    maybeCreateMemory(deviceId: string, content: string, date: string): Promise<void>;
    clearShortTerm(): void;
}
