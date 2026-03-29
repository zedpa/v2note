/**
 * 未满足请求记录
 *
 * 当路路找不到匹配工具时，记录用户的请求用于未来需求排序。
 */
import { execute } from "../db/pool.js";
export async function recordUnmetRequest(input) {
    await execute(`INSERT INTO unmet_request (user_id, request_text, failure_reason, session_mode)
     VALUES ($1, $2, $3, $4)`, [input.userId, input.requestText, input.failureReason, input.sessionMode ?? null]);
}
//# sourceMappingURL=unmet-request.js.map