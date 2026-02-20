/**
 * Short-term memory — stored in session context.
 * Automatically managed as part of conversation history.
 */

export interface ShortTermEntry {
  content: string;
  timestamp: Date;
}

export class ShortTermMemory {
  private entries: ShortTermEntry[] = [];
  private maxEntries = 20;

  add(content: string) {
    this.entries.push({ content, timestamp: new Date() });
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  getAll(): ShortTermEntry[] {
    return [...this.entries];
  }

  getSummary(): string {
    return this.entries.map((e) => e.content).join("\n");
  }

  clear() {
    this.entries = [];
  }
}
