const MAX_MESSAGES = 50;
/**
 * Manages the context window for a conversation session.
 * Keeps messages trimmed to stay within limits.
 */
export class SessionContext {
    messages = [];
    systemPrompt = "";
    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
    }
    addMessage(msg) {
        this.messages.push(msg);
        // Trim old messages if too many (keep system prompt separate)
        if (this.messages.length > MAX_MESSAGES) {
            // Keep first 2 and last (MAX - 2) messages
            this.messages = [
                ...this.messages.slice(0, 2),
                ...this.messages.slice(-(MAX_MESSAGES - 2)),
            ];
        }
    }
    getMessages() {
        const result = [];
        if (this.systemPrompt) {
            result.push({ role: "system", content: this.systemPrompt });
        }
        result.push(...this.messages);
        return result;
    }
    clear() {
        this.messages = [];
        this.systemPrompt = "";
    }
    getHistory() {
        return [...this.messages];
    }
}
//# sourceMappingURL=context.js.map