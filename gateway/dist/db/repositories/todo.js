import { query, queryOne, execute } from "../pool.js";
import { getEmbedding, cosineSimilarity } from "../../memory/embeddings.js";
export async function findByDevice(deviceId) {
    return query(`SELECT t.*,
            COALESCE(sc.cnt, 0)::int AS subtask_count,
            COALESCE(sc.done_cnt, 0)::int AS subtask_done_count,
            p.text AS goal_title
     FROM todo t
     LEFT JOIN record r ON r.id = t.record_id
     LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE done)::int AS done_cnt
       FROM todo sub WHERE sub.parent_id = t.id
     ) sc ON true
     WHERE (r.device_id = $1 OR t.device_id = $1) AND t.parent_id IS NULL
     ORDER BY t.created_at DESC`, [deviceId]);
}
export async function findByUser(userId) {
    return query(`SELECT t.*,
            COALESCE(sc.cnt, 0)::int AS subtask_count,
            COALESCE(sc.done_cnt, 0)::int AS subtask_done_count,
            p.text AS goal_title
     FROM todo t
     LEFT JOIN record r ON r.id = t.record_id
     LEFT JOIN todo p ON p.id = t.parent_id AND p.level >= 1
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE done)::int AS done_cnt
       FROM todo sub WHERE sub.parent_id = t.id
     ) sc ON true
     WHERE (r.user_id = $1 OR t.user_id = $1) AND t.parent_id IS NULL
     ORDER BY t.created_at DESC`, [userId]);
}
export async function findPendingByUser(userId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.user_id = $1 AND t.done = false
     ORDER BY t.created_at ASC`, [userId]);
}
export async function findByGoalId(goalId) {
    return query(`SELECT * FROM todo WHERE goal_id = $1 ORDER BY created_at`, [goalId]);
}
export async function findByRecordId(recordId) {
    return query(`SELECT * FROM todo WHERE record_id = $1 ORDER BY created_at`, [recordId]);
}
export async function create(fields) {
    const cols = ["text", "done"];
    const vals = [fields.text, fields.done ?? false];
    const optionals = [
        ["record_id", fields.record_id],
        ["strike_id", fields.strike_id],
        ["domain", fields.domain],
        ["impact", fields.impact],
        ["goal_id", fields.goal_id],
        ["scheduled_start", fields.scheduled_start],
        ["estimated_minutes", fields.estimated_minutes],
        ["user_id", fields.user_id],
        ["device_id", fields.device_id],
        ["parent_id", fields.parent_id],
        ["level", fields.level],
        ["status", fields.status],
    ];
    for (const [col, val] of optionals) {
        if (val !== undefined && val !== null) {
            cols.push(col);
            vals.push(val);
        }
    }
    const placeholders = vals.map((_, idx) => `$${idx + 1}`).join(", ");
    const row = await queryOne(`INSERT INTO todo (${cols.join(", ")}) VALUES (${placeholders}) RETURNING *`, vals);
    return row;
}
export async function createMany(items) {
    if (items.length === 0)
        return;
    const values = [];
    const params = [];
    let i = 1;
    for (const item of items) {
        values.push(`($${i++}, $${i++}, $${i++})`);
        params.push(item.record_id, item.text, item.done ?? false);
    }
    await execute(`INSERT INTO todo (record_id, text, done) VALUES ${values.join(", ")}`, params);
}
export async function update(id, fields) {
    const sets = [];
    const params = [];
    let i = 1;
    if (fields.text !== undefined) {
        sets.push(`text = $${i++}`);
        params.push(fields.text);
    }
    if (fields.done !== undefined) {
        sets.push(`done = $${i++}`);
        params.push(fields.done);
    }
    if (fields.estimated_minutes !== undefined) {
        sets.push(`estimated_minutes = $${i++}`);
        params.push(fields.estimated_minutes);
    }
    if (fields.scheduled_start !== undefined) {
        sets.push(`scheduled_start = $${i++}`);
        params.push(fields.scheduled_start);
    }
    if (fields.scheduled_end !== undefined) {
        sets.push(`scheduled_end = $${i++}`);
        params.push(fields.scheduled_end);
    }
    if (fields.priority !== undefined) {
        sets.push(`priority = $${i++}`);
        params.push(fields.priority);
    }
    if (fields.domain !== undefined) {
        sets.push(`domain = $${i++}`);
        params.push(fields.domain);
    }
    if (fields.impact !== undefined) {
        sets.push(`impact = $${i++}`);
        params.push(fields.impact);
    }
    if (fields.ai_actionable !== undefined) {
        sets.push(`ai_actionable = $${i++}`);
        params.push(fields.ai_actionable);
    }
    if (fields.ai_action_plan !== undefined) {
        sets.push(`ai_action_plan = $${i++}`);
        params.push(JSON.stringify(fields.ai_action_plan));
    }
    if (fields.goal_id !== undefined) {
        sets.push(`goal_id = $${i++}`);
        params.push(fields.goal_id);
    }
    if (fields.strike_id !== undefined) {
        sets.push(`strike_id = $${i++}`);
        params.push(fields.strike_id);
    }
    if (fields.level !== undefined) {
        sets.push(`level = $${i++}`);
        params.push(fields.level);
    }
    if (fields.status !== undefined) {
        sets.push(`status = $${i++}`);
        params.push(fields.status);
    }
    if (sets.length === 0)
        return;
    params.push(id);
    await execute(`UPDATE todo SET ${sets.join(", ")} WHERE id = $${i}`, params);
}
export async function del(id) {
    await execute(`DELETE FROM todo WHERE id = $1`, [id]);
}
export async function toggle(id) {
    return queryOne(`UPDATE todo SET done = NOT done WHERE id = $1 RETURNING *`, [id]);
}
export async function countByDateRange(deviceId, start, end) {
    const row = await queryOne(`SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE t.done)::text AS done
     FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.created_at >= $2 AND t.created_at <= $3`, [deviceId, start, end]);
    return {
        total: parseInt(row?.total ?? "0", 10),
        done: parseInt(row?.done ?? "0", 10),
    };
}
export async function countByUserDateRange(userId, start, end) {
    const row = await queryOne(`SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE t.done)::text AS done
     FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.user_id = $1 AND t.created_at >= $2 AND t.created_at <= $3`, [userId, start, end]);
    return {
        total: parseInt(row?.total ?? "0", 10),
        done: parseInt(row?.done ?? "0", 10),
    };
}
/**
 * 计算连续记录天数（从昨天往前数，一次 SQL 查出近 30 天有 todo 的日期）
 */
export async function getStreak(opts) {
    const { userId, deviceId } = opts;
    const [where, params] = userId
        ? ["user_id = $1", [userId]]
        : ["device_id = $1", [deviceId]];
    const rows = await query(`SELECT DISTINCT DATE(created_at) AS d FROM todo
     WHERE ${where} AND created_at >= NOW() - INTERVAL '30 days'
     ORDER BY d DESC`, params);
    // 从昨天开始数连续天
    let streak = 0;
    const now = new Date();
    for (let i = 1; i <= 30; i++) {
        const target = new Date(now.getTime() - i * 86400000)
            .toISOString().split("T")[0];
        if (rows.some((r) => r.d.startsWith(target))) {
            streak++;
        }
        else {
            break;
        }
    }
    return streak;
}
export async function findPendingByDevice(deviceId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.done = false
     ORDER BY t.created_at ASC`, [deviceId]);
}
export async function findRelayByDevice(deviceId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.device_id = $1 AND t.category = 'relay' AND t.done = false
     ORDER BY t.created_at ASC`, [deviceId]);
}
export async function findRelayByUser(userId) {
    return query(`SELECT t.* FROM todo t
     JOIN record r ON r.id = t.record_id
     WHERE r.user_id = $1 AND t.category = 'relay' AND t.done = false
     ORDER BY t.created_at ASC`, [userId]);
}
export async function findById(id) {
    return queryOne(`SELECT * FROM todo WHERE id = $1`, [id]);
}
export async function findSubtasks(parentId) {
    return query(`SELECT * FROM todo WHERE parent_id = $1 ORDER BY created_at ASC`, [parentId]);
}
export async function createWithCategory(fields) {
    const row = await queryOne(`INSERT INTO todo (record_id, text, done, category, relay_meta)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`, [
        fields.record_id,
        fields.text,
        fields.done ?? false,
        fields.category ?? "action",
        fields.relay_meta ? JSON.stringify(fields.relay_meta) : null,
    ]);
    return row;
}
// ── 统一模型方法（Goal 消解后）──────────────────────────────────────
/**
 * 创建目标/项目前查重（永久防护 Step 1c）
 *
 * 相似度 ≥ 0.75 → 返回已有记录（不创建）
 * 相似度 0.5-0.75 → 创建 suggested 状态
 * 相似度 < 0.5 → 正常创建
 */
export async function createWithDedup(params) {
    // 获取已有活跃目标
    const existing = await query(`SELECT * FROM todo WHERE user_id = $1 AND level >= 1
     AND status IN ('active', 'progressing', 'suggested')`, [params.user_id]);
    if (existing.length > 0) {
        try {
            const newEmb = await getEmbedding(params.text);
            let bestMatch = null;
            for (const ex of existing) {
                const exEmb = await getEmbedding(ex.text);
                const sim = cosineSimilarity(newEmb, exEmb);
                if (!bestMatch || sim > bestMatch.similarity) {
                    bestMatch = { todo: ex, similarity: sim };
                }
            }
            if (bestMatch && bestMatch.similarity >= 0.75) {
                console.log(`[todo-dedup] Matched: "${params.text}" → "${bestMatch.todo.text}" (sim=${bestMatch.similarity.toFixed(3)})`);
                return { todo: bestMatch.todo, action: "matched" };
            }
            if (bestMatch && bestMatch.similarity >= 0.5) {
                console.log(`[todo-dedup] Suggested (possible dup): "${params.text}" ↔ "${bestMatch.todo.text}" (sim=${bestMatch.similarity.toFixed(3)})`);
                const todo = await createGoalAsTodo({
                    ...params,
                    status: "suggested",
                });
                return { todo, action: "suggested" };
            }
        }
        catch (e) {
            console.warn(`[todo-dedup] Embedding failed, creating without dedup: ${e.message}`);
        }
    }
    // 相似度 < 0.5 或无已有目标
    const todo = await createGoalAsTodo(params);
    console.log(`[todo-dedup] Created: "${params.text}"`);
    return { todo, action: "created" };
}
/** 创建 todo（level 0=行动, 1=目标, 2=项目） */
export async function createGoalAsTodo(fields) {
    const row = await queryOne(`INSERT INTO todo (user_id, device_id, text, level, status, cluster_id, parent_id, domain, done)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false) RETURNING *`, [
        fields.user_id,
        fields.device_id,
        fields.text,
        fields.level,
        fields.status ?? "suggested",
        fields.cluster_id ?? null,
        fields.parent_id ?? null,
        fields.domain ?? null,
    ]);
    return row;
}
/** 更新 status，同步 done 字段保持一致 */
export async function updateStatus(id, status) {
    const done = status === "completed";
    await execute(`UPDATE todo SET status = $1, done = $2, updated_at = now() WHERE id = $3`, [status, done, id]);
}
/** 批量更新 cluster_id 引用（聚类合并时用，替代 goalRepo.updateClusterRef） */
export async function updateClusterRef(oldClusterId, newClusterId) {
    await execute(`UPDATE todo SET cluster_id = $1 WHERE cluster_id = $2 AND level >= 1`, [newClusterId, oldClusterId]);
}
/** 按 domain(L3) 查询 level>=1 的目标/项目树 */
export async function findGoalsByDomain(userId, domain) {
    if (domain) {
        return query(`SELECT * FROM todo WHERE user_id = $1 AND level >= 1 AND domain = $2
       AND status IN ('active', 'progressing', 'suggested')
       ORDER BY level DESC, created_at DESC`, [userId, domain]);
    }
    return query(`SELECT * FROM todo WHERE user_id = $1 AND level >= 1
     AND status IN ('active', 'progressing', 'suggested')
     ORDER BY level DESC, created_at DESC`, [userId]);
}
/** 查询用户所有活跃目标（替代 goalRepo.findActiveByUser） */
export async function findActiveGoalsByUser(userId) {
    return query(`SELECT t.*,
            COALESCE(sc.cnt, 0)::int AS subtask_count,
            COALESCE(sc.done_cnt, 0)::int AS subtask_done_count
     FROM todo t
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE done)::int AS done_cnt
       FROM todo sub WHERE sub.parent_id = t.id
     ) sc ON true
     WHERE t.user_id = $1 AND t.level >= 1
       AND t.status IN ('active', 'progressing')
     ORDER BY t.created_at DESC`, [userId]);
}
/** 查询用户所有活跃目标（替代 goalRepo.findActiveByDevice） */
export async function findActiveGoalsByDevice(deviceId) {
    return query(`SELECT t.*,
            COALESCE(sc.cnt, 0)::int AS subtask_count,
            COALESCE(sc.done_cnt, 0)::int AS subtask_done_count
     FROM todo t
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE done)::int AS done_cnt
       FROM todo sub WHERE sub.parent_id = t.id
     ) sc ON true
     WHERE t.device_id = $1 AND t.level >= 1
       AND t.status IN ('active', 'progressing')
     ORDER BY t.created_at DESC`, [deviceId]);
}
/** 按 parent_id 查找子 todo（替代 goalRepo.findWithTodos） */
export async function findChildTodos(parentId) {
    return query(`SELECT * FROM todo WHERE parent_id = $1 ORDER BY created_at`, [parentId]);
}
/** 侧边栏：按 domain 分组统计（支持 user_id 或 device_id）
 * @deprecated 使用 getMyWorldData 替代
 */
export async function getDimensionSummary(userId, deviceId) {
    const whereClause = userId ? "user_id = $1" : "device_id = $1";
    const param = userId ?? deviceId;
    if (!param)
        return [];
    return query(`SELECT COALESCE(domain, '其他') AS domain,
            COUNT(*) FILTER (WHERE level = 0 AND done = false)::int AS pending_count,
            COUNT(*) FILTER (WHERE level >= 1 AND status IN ('active', 'progressing'))::int AS goal_count
     FROM todo
     WHERE (${whereClause}) AND status != 'archived'
     GROUP BY COALESCE(domain, '其他')
     ORDER BY pending_count DESC`, [param]);
}
/** 从 strike.nucleus 提取聚类名称：格式 "[名称] 描述" → "名称" */
function extractClusterName(nucleus) {
    const m = nucleus.match(/^\[(.+?)\]/);
    return m ? m[1] : nucleus.slice(0, 20);
}
/** 侧边栏"我的世界"：组装三级树结构 */
export async function getMyWorldData(userId) {
    // 1. 查所有活跃聚类（L1 + L2）
    const clusters = await query(`SELECT s.id, s.nucleus, COALESCE(s.level, 1) AS level,
            COUNT(cm.target_strike_id)::int AS member_count
     FROM strike s
     LEFT JOIN bond cm ON cm.source_strike_id = s.id AND cm.type = 'cluster_member'
     WHERE s.user_id = $1 AND s.is_cluster = true AND s.status = 'active'
     GROUP BY s.id, s.nucleus, s.level
     ORDER BY COUNT(cm.target_strike_id) DESC`, [userId]);
    const l2Clusters = clusters.filter(c => c.level === 2);
    const l1Clusters = clusters.filter(c => c.level !== 2);
    // 2. 查 L2 的 L1 成员
    const l2Ids = l2Clusters.map(c => c.id);
    const l2Members = l2Ids.length > 0
        ? await query(`SELECT source_strike_id, target_strike_id FROM bond
         WHERE source_strike_id = ANY($1) AND type = 'cluster_member'`, [l2Ids])
        : [];
    const l1InL2 = new Set(l2Members.map(m => m.target_strike_id));
    const independentL1 = l1Clusters.filter(c => !l1InL2.has(c.id));
    // 3. 查所有 level>=1 目标（挂在聚类下或独立）
    const allClusterIds = clusters.map(c => c.id);
    const goals = await query(`SELECT t.*,
            COALESCE(sc.cnt, 0)::int AS subtask_count,
            COALESCE(sc.done_cnt, 0)::int AS subtask_done_count
     FROM todo t
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt, COUNT(*) FILTER (WHERE done)::int AS done_cnt
       FROM todo sub WHERE sub.parent_id = t.id
     ) sc ON true
     WHERE t.user_id = $1 AND t.level >= 1
       AND t.status IN ('active', 'progressing')
     ORDER BY t.updated_at DESC NULLS LAST`, [userId]);
    // 按 cluster_id 分组
    const goalsByCluster = new Map();
    const orphanGoals = [];
    for (const g of goals) {
        const cid = g.cluster_id;
        if (cid && allClusterIds.includes(cid)) {
            const list = goalsByCluster.get(cid) ?? [];
            list.push(g);
            goalsByCluster.set(cid, list);
        }
        else if (!g.parent_id) {
            orphanGoals.push(g);
        }
    }
    // 4. 查第三级子任务（goals 的子项）
    const goalIds = goals.map(g => g.id);
    const actions = goalIds.length > 0
        ? await query(`SELECT * FROM todo
         WHERE parent_id = ANY($1) AND level = 0 AND status != 'archived'
         ORDER BY created_at`, [goalIds])
        : [];
    const actionsByParent = new Map();
    for (const a of actions) {
        const list = actionsByParent.get(a.parent_id) ?? [];
        list.push(a);
        actionsByParent.set(a.parent_id, list);
    }
    // ── 辅助函数：构建目标节点 ──
    function buildGoalNode(g) {
        const childActions = actionsByParent.get(g.id) ?? [];
        return {
            id: g.id,
            type: "goal",
            title: g.text,
            status: g.status ?? "active",
            subtaskTotal: g.subtask_count,
            subtaskDone: g.subtask_done_count,
            children: childActions.slice(0, 10).map(a => ({
                id: a.id,
                type: "action",
                title: a.text,
                done: a.done,
                children: [],
            })),
        };
    }
    // ── 辅助函数：构建 L1 聚类节点 ──
    function buildL1Node(c) {
        const clusterGoals = goalsByCluster.get(c.id) ?? [];
        return {
            id: c.id,
            type: "l1_cluster",
            title: extractClusterName(c.nucleus),
            memberCount: c.member_count,
            children: clusterGoals.slice(0, 8).map(buildGoalNode),
        };
    }
    // ── 组装第一级 ──
    const nodes = [];
    // 有 L2 时：L2 → L1 → 目标
    for (const l2 of l2Clusters) {
        const memberL1Ids = l2Members
            .filter(m => m.source_strike_id === l2.id)
            .map(m => m.target_strike_id);
        const memberL1s = l1Clusters.filter(c => memberL1Ids.includes(c.id));
        // L2 下也可能直接挂目标
        const l2Goals = goalsByCluster.get(l2.id) ?? [];
        nodes.push({
            id: l2.id,
            type: "l2_cluster",
            title: extractClusterName(l2.nucleus),
            memberCount: l2.member_count,
            children: [
                ...memberL1s.map(buildL1Node),
                ...l2Goals.slice(0, 8).map(buildGoalNode),
            ],
        });
    }
    // 独立 L1 聚类
    for (const c of independentL1) {
        nodes.push(buildL1Node(c));
    }
    // 独立目标（无聚类归属、无父级）
    for (const g of orphanGoals.slice(0, 15)) {
        nodes.push(buildGoalNode(g));
    }
    return nodes;
}
//# sourceMappingURL=todo.js.map