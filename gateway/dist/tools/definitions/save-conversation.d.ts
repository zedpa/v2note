import type { ToolDefinition } from "../types.js";
/**
 * save_conversation — 将对话中的内容保存为日记
 *
 * 解决 create_record 的"长内容复制"问题：
 * 当 AI 生成了报告/分析等长文本后，用户要求保存为日记，
 * AI 无需在 tool call 中重新输出全部内容（可能因 output token 限制截断），
 * 而是调用此工具，由工具从对话历史中提取最近的 assistant 消息内容。
 */
export declare const saveConversationTool: ToolDefinition;
