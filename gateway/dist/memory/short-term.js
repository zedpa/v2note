/**
 * Short-term memory — stored in session context.
 * Automatically managed as part of conversation history.
 */
export class ShortTermMemory {
    entries = [];
    maxEntries = 20;
    add(content) {
        this.entries.push({ content, timestamp: new Date() });
        if (this.entries.length > this.maxEntries) {
            this.entries = this.entries.slice(-this.maxEntries);
        }
    }
    getAll() {
        return [...this.entries];
    }
    getSummary() {
        return this.entries.map((e) => e.content).join("\n");
    }
    clear() {
        this.entries = [];
    }
}
//# sourceMappingURL=short-term.js.map