/**
 * Decision analysis — deep cognitive graph traversal for decision support.
 *
 * When user says "帮我想想要不要换供应商", this module:
 * 1. Deep semantic retrieval across all time (not date-range limited)
 * 2. Loads related clusters + cognitive patterns
 * 3. Builds a decision-specific prompt with source attribution
 * 4. Returns structured analysis with Strike ID citations
 */
import { hybridRetrieve } from "./retrieval.js";
import { query } from "../db/pool.js";
import { formatDateWithRelative } from "../lib/date-anchor.js";
/**
 * Gather all relevant cognitive context for a decision question.
 */
export async function gatherDecisionContext(question, userId) {
    const ctx = {
        strikes: [],
        clusters: [],
        patterns: [],
        contradictions: [],
    };
    // 1. Deep retrieval — use all hybrid channels, higher limit
    try {
        const retrieved = await hybridRetrieve(question, [], userId, { limit: 30 });
        ctx.strikes = retrieved.map((r) => ({
            id: r.strike.id,
            nucleus: r.strike.nucleus,
            polarity: r.strike.polarity,
            confidence: r.strike.confidence,
            created_at: r.strike.created_at,
        }));
    }
    catch (err) {
        console.warn("[decision] Retrieval failed:", err);
    }
    // 2. Related clusters
    try {
        const clusters = await query(`SELECT s.*, COUNT(cm.target_strike_id) as member_count
       FROM strike s
       JOIN bond cm ON cm.source_strike_id = s.id AND cm.type = 'cluster_member'
       WHERE s.user_id = $1 AND s.is_cluster = true AND s.status = 'active'
       GROUP BY s.id
       ORDER BY member_count DESC LIMIT 10`, [userId]);
        ctx.clusters = clusters.map((c) => ({
            id: c.id,
            name: c.nucleus,
            memberCount: parseInt(c.member_count),
        }));
    }
    catch (err) {
        console.warn("[decision] Cluster loading failed:", err);
    }
    // 3. Cognitive patterns (realize strikes from emergence)
    try {
        const patterns = await query(`SELECT * FROM strike
       WHERE user_id = $1 AND polarity = 'realize' AND source_type = 'inference'
         AND status = 'active'
       ORDER BY confidence DESC LIMIT 10`, [userId]);
        ctx.patterns = patterns.map((p) => ({
            id: p.id,
            nucleus: p.nucleus,
            confidence: p.confidence,
        }));
    }
    catch (err) {
        console.warn("[decision] Pattern loading failed:", err);
    }
    // 4. Contradictions involving retrieved strikes
    try {
        const strikeIds = ctx.strikes.map((s) => s.id);
        if (strikeIds.length > 0) {
            const contradictions = await query(`SELECT
           sa.id as sa_id, sa.nucleus as sa_nucleus,
           sb.id as sb_id, sb.nucleus as sb_nucleus
         FROM bond b
         JOIN strike sa ON sa.id = b.source_strike_id
         JOIN strike sb ON sb.id = b.target_strike_id
         WHERE b.type = 'contradiction'
           AND (b.source_strike_id = ANY($1) OR b.target_strike_id = ANY($1))
         LIMIT 10`, [strikeIds]);
            ctx.contradictions = contradictions.map((c) => ({
                strikeA: { id: c.sa_id, nucleus: c.sa_nucleus },
                strikeB: { id: c.sb_id, nucleus: c.sb_nucleus },
            }));
        }
    }
    catch (err) {
        console.warn("[decision] Contradiction loading failed:", err);
    }
    return ctx;
}
/**
 * Build the decision analysis system prompt.
 */
export function buildDecisionPrompt(ctx) {
    const parts = [];
    parts.push(`你是用户的认知决策顾问。用户正在思考一个决策问题。

你的任务：
1. 基于用户自己过去的观察、判断、经验来分析这个问题
2. 每个论据必须标注来源 [strike:ID]，让用户可以追溯
3. 如果存在矛盾的认知，明确指出
4. 用用户自己的思维模式来组织分析，而不是通用框架
5. 最终给出结构化的决策参考，不替用户做决定`);
    // Relevant strikes
    if (ctx.strikes.length > 0) {
        parts.push(`\n## 相关认知记录`);
        for (const s of ctx.strikes) {
            const date = formatDateWithRelative(new Date(s.created_at));
            parts.push(`[strike:${s.id.slice(0, 8)}] (${s.polarity}, ${date}) ${s.nucleus}`);
        }
    }
    // Clusters
    if (ctx.clusters.length > 0) {
        parts.push(`\n## 相关认知主题`);
        for (const c of ctx.clusters) {
            parts.push(`- ${c.name}（${c.memberCount}条相关记录）`);
        }
    }
    // Patterns
    if (ctx.patterns.length > 0) {
        parts.push(`\n## 用户的认知模式`);
        for (const p of ctx.patterns) {
            parts.push(`[strike:${p.id.slice(0, 8)}] ${p.nucleus}（置信度: ${p.confidence}）`);
        }
        parts.push(`\n请优先使用这些模式来组织分析。`);
    }
    // Contradictions
    if (ctx.contradictions.length > 0) {
        parts.push(`\n## ⚠️ 存在矛盾的认知`);
        for (const c of ctx.contradictions) {
            parts.push(`- 「${c.strikeA.nucleus}」 vs 「${c.strikeB.nucleus}」`);
        }
        parts.push(`\n请在分析中明确指出这些矛盾对决策的影响。`);
    }
    parts.push(`\n## 输出格式
请用以下结构回复：
1. **问题理解**：用一句话概括决策的核心张力
2. **支持论据**：列出支持某方向的论据，每条标注 [strike:ID]
3. **反对论据**：列出反对的论据，每条标注 [strike:ID]
4. **矛盾与盲区**：指出认知中的矛盾和信息缺失
5. **决策参考**：基于用户自己的认知模式给出建议方向（不做决定）`);
    return parts.join("\n");
}
//# sourceMappingURL=decision.js.map