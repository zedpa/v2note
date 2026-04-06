/**
 * 对话上下文压缩
 * spec: chat-persistence.md 场景 4.1-4.5
 */
/** 压缩 prompt：保留关键信息的指令 */
export declare const COMPRESS_PROMPT = "\u8BF7\u5C06\u4EE5\u4E0B\u5BF9\u8BDD\u538B\u7F29\u4E3A\u4E00\u6BB5\u7B80\u6D01\u7684\u6458\u8981\uFF0C\u4F9B\u540E\u7EED\u5BF9\u8BDD\u53C2\u8003\u3002\n\u5FC5\u987B\u4FDD\u7559\uFF1A\n- \u7528\u6237\u8868\u8FBE\u7684\u504F\u597D\u548C\u4E60\u60EF\n- \u505A\u51FA\u7684\u51B3\u7B56\u548C\u7ED3\u8BBA\n- \u63D0\u5230\u7684\u5177\u4F53\u4EBA\u540D\u3001\u9879\u76EE\u540D\u3001\u6570\u5B57\n- \u7528\u6237\u7684\u60C5\u611F\u72B6\u6001\u53D8\u5316\n- \u672A\u5B8C\u6210\u7684\u8BA8\u8BBA\u6216\u5F85\u8DDF\u8FDB\u4E8B\u9879\n\u53EF\u4EE5\u7701\u7565\uFF1A\u5BD2\u6684\u3001\u91CD\u590D\u5185\u5BB9\u3001AI \u7684\u5197\u957F\u89E3\u91CA";
/** 判断是否需要触发压缩 */
export declare function shouldCompress(userId: string): Promise<boolean>;
/**
 * 执行压缩：
 * 1. 取最早的 (N-20) 条未压缩消息
 * 2. AI 生成摘要
 * 3. 保存为 context-summary
 * 4. 标记源消息为 compressed
 * 5. 合并过多的 summary（>5 条时）
 */
export declare function compressMessages(userId: string): Promise<void>;
/**
 * 在 sendChatMessage 后异步调用，检查并执行压缩
 * 不阻塞当前请求
 */
export declare function maybeCompress(userId: string): Promise<void>;
