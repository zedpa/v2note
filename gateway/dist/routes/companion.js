import { sendJson, sendError, getDeviceId, getUserId } from "../lib/http-helpers.js";
import { query } from "../db/pool.js";
import { getSession } from "../session/manager.js";
// ── Status / Mood text mappings ──
const STATUS_TEXT = {
    eating: "",
    organizing: "在整理你的想法",
    sunbathing: "今天效率不错",
    drinking: "有些想法在冒泡",
    spacing_out: "...",
    angry: "那件事又跳过了",
    worried: "这么晚了...",
    speaking: "",
    thinking: "让我想想...",
    running: "忙着呢!",
};
const MOOD_TEXT = {
    happy: "开心",
    curious: "好奇",
    worried: "担心",
    missing: "想念",
    caring: "心疼",
    focused: "专注",
    calm: "平静",
};
// ── Helpers ──
/** 获取当前小时（服务端本地时区） */
function currentHour() {
    return new Date().getHours();
}
/** 检查小时是否在深夜区间 23:00-05:59 */
function isLateNight(hour) {
    return hour >= 23 || hour < 6;
}
export function registerCompanionRoutes(router) {
    // ── GET /api/v1/companion/status ──
    // 返回小鹿当前状态 + 心情 + 待推送消息
    router.get("/api/v1/companion/status", async (req, res) => {
        try {
            const userId = getUserId(req);
            if (!userId) {
                sendError(res, "Missing user identity", 401);
                return;
            }
            let deviceId;
            try {
                deviceId = getDeviceId(req);
            }
            catch {
                sendError(res, "Missing device identity", 401);
                return;
            }
            const hour = currentHour();
            // ── 并行查询所有需要的数据 ──
            const [sessionMode, skipCountResult, completedTodayResult, pendingIntendResult, recentRecordResult, recentClusterResult, noRecords48hResult,] = await Promise.all([
                // 1. Session mode（内存查询，不创建新 session）
                Promise.resolve(getSession(deviceId).mode),
                // 2. 是否有 skip_count >= 5 的 todo
                query(`SELECT COUNT(*) as cnt FROM todo t
           JOIN record r ON r.id = t.record_id
           WHERE r.device_id = $1 AND t.done = false AND t.skip_count >= 5`, [deviceId]),
                // 3. 今日完成的 todo 数量
                query(`SELECT COUNT(*) as cnt FROM todo t
           JOIN record r ON r.id = t.record_id
           WHERE r.device_id = $1 AND t.done = true
             AND t.completed_at::date = CURRENT_DATE`, [deviceId]),
                // 4. 未关联 goal 的 intend strike 数量
                query(`SELECT COUNT(*) as cnt FROM strike s
           WHERE s.user_id = $1 AND s.polarity = 'intend' AND s.status = 'active'
             AND NOT EXISTS (
               SELECT 1 FROM goal g WHERE g.cluster_id IN (
                 SELECT b.target_strike_id FROM bond b
                 WHERE b.source_strike_id = s.id AND b.type = 'cluster_member'
               ) AND g.status = 'active'
             )`, [userId]),
                // 5. 24 小时内是否有 record
                query(`SELECT COUNT(*) as cnt FROM record
           WHERE device_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [deviceId]),
                // 6. 最近是否有新 cluster 涌现（24h 内）
                query(`SELECT COUNT(*) as cnt FROM strike
           WHERE user_id = $1 AND is_cluster = true
             AND created_at > NOW() - INTERVAL '24 hours'`, [userId]),
                // 7. 48 小时内是否无 record（用于 mood: missing）
                query(`SELECT COUNT(*) as cnt FROM record
           WHERE device_id = $1 AND created_at > NOW() - INTERVAL '48 hours'`, [deviceId]),
            ]);
            const hasActiveChat = sessionMode === "chat";
            const hasSkippy = parseInt(skipCountResult[0]?.cnt ?? "0", 10) > 0;
            const completedToday = parseInt(completedTodayResult[0]?.cnt ?? "0", 10);
            const pendingIntend = parseInt(pendingIntendResult[0]?.cnt ?? "0", 10);
            const hasRecentRecord = parseInt(recentRecordResult[0]?.cnt ?? "0", 10) > 0;
            const hasNewCluster = parseInt(recentClusterResult[0]?.cnt ?? "0", 10) > 0;
            const hasRecords48h = parseInt(noRecords48hResult[0]?.cnt ?? "0", 10) > 0;
            // ── 计算 state（按优先级从高到低）──
            let state;
            if (hasActiveChat) {
                state = "thinking";
            }
            else if (hasSkippy) {
                // angry 优先级高于时间类状态
                state = "angry";
            }
            else if (isLateNight(hour)) {
                state = "worried";
            }
            else if (completedToday >= 3) {
                state = "sunbathing";
            }
            else if (pendingIntend >= 3) {
                state = "drinking";
            }
            else if (!hasRecentRecord) {
                state = "spacing_out";
            }
            else {
                state = "eating";
            }
            // ── 计算 mood（按优先级从高到低）──
            let mood;
            if (completedToday >= 3) {
                mood = "happy";
            }
            else if (hasNewCluster) {
                mood = "curious";
            }
            else if (hasSkippy) {
                mood = "worried";
            }
            else if (!hasRecords48h) {
                mood = "missing";
            }
            else if (isLateNight(hour)) {
                mood = "caring";
            }
            else {
                mood = "calm";
            }
            // ── 待推送消息（暂时返回 null，后续对接 proactive engine）──
            const pendingMessage = null;
            const result = {
                state,
                stateText: STATUS_TEXT[state] ?? "",
                mood,
                moodText: MOOD_TEXT[mood] ?? "",
                pendingMessage,
            };
            sendJson(res, result);
        }
        catch (err) {
            console.error("[companion] GET /api/v1/companion/status error:", err);
            sendError(res, err.message ?? "Internal error", 500);
        }
    });
}
//# sourceMappingURL=companion.js.map