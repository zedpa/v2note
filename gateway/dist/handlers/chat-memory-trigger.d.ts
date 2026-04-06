/**
 * 即时记忆触发：关键词快筛
 * spec: chat-persistence.md 场景 5.1-5.2
 *
 * 快筛只是门槛过滤，命中后由 Mem0 AI 判断是否真正值得存储。
 */
/** 预编译的记忆触发正则 — O(1) 匹配 */
export declare const MEMORY_TRIGGER_REGEX: RegExp;
/** 检测消息是否命中记忆触发关键词 */
export declare function shouldTriggerMemory(text: string): boolean;
