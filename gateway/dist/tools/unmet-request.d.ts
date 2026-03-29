/**
 * 未满足请求记录
 *
 * 当路路找不到匹配工具时，记录用户的请求用于未来需求排序。
 */
interface UnmetRequestInput {
    userId: string;
    requestText: string;
    failureReason: string;
    sessionMode?: string;
}
export declare function recordUnmetRequest(input: UnmetRequestInput): Promise<void>;
export {};
