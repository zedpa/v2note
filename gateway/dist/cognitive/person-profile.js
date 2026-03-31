/**
 * 人物画像系统
 * - scanPersons: 从 Strike tags 扫描高频人名，创建 person 记录
 * - extractPersonPatterns: AI 提取人物行为模式
 * - getPersonContext: 获取人物上下文（注入参谋对话）
 */
import { query, queryOne, execute } from "../db/pool.js";
import { chatCompletion } from "../ai/provider.js";
const MIN_MENTION_COUNT = 5;
/**
 * 从 Strike tags 中扫描高频人名（出现 5+ 次），创建 person 记录。
 * 依赖 Digest prompt 中对人名的 tag 提取。
 */
export async function scanPersons(userId) {
    let newPersons = 0;
    let updated = 0;
    // 统计 tag label 出现频率（假设人名标签格式：常见中文名）
    const tagCounts = await query(`SELECT st.label, COUNT(DISTINCT st.strike_id)::text as strike_count
     FROM strike_tag st
     JOIN strike s ON s.id = st.strike_id
     WHERE s.user_id = $1 AND s.status = 'active'
       AND length(st.label) BETWEEN 2 AND 4
       AND st.label ~ '^[\u4e00-\u9fff]+$'
     GROUP BY st.label
     HAVING COUNT(DISTINCT st.strike_id) >= $2
     ORDER BY strike_count DESC
     LIMIT 50`, [userId, MIN_MENTION_COUNT]);
    if (tagCounts.length === 0)
        return { newPersons: 0, updated: 0 };
    // 获取已存在的 person
    const existingPersons = await query(`SELECT name FROM person WHERE user_id = $1`, [userId]);
    const existingNames = new Set(existingPersons.map((p) => p.name));
    for (const tag of tagCounts) {
        const count = parseInt(tag.strike_count, 10);
        if (existingNames.has(tag.label)) {
            // 更新统计
            await execute(`UPDATE person SET stats = jsonb_set(COALESCE(stats, '{}'::jsonb), '{mentionCount}', $1::jsonb), updated_at = NOW()
         WHERE user_id = $2 AND name = $3`, [String(count), userId, tag.label]);
            updated++;
        }
        else {
            // 创建新 person
            await execute(`INSERT INTO person (user_id, name, stats) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, name) DO NOTHING`, [userId, tag.label, JSON.stringify({ mentionCount: count })]);
            newPersons++;
        }
    }
    return { newPersons, updated };
}
// ── 场景 2: 行为模式提取 ─────────────────────────────────────────────
/**
 * AI 分析某人相关的所有 Strike，提取行为模式。
 */
export async function extractPersonPatterns(personId) {
    const person = await queryOne(`SELECT id, name, user_id FROM person WHERE id = $1`, [personId]);
    if (!person)
        return [];
    // 获取相关 Strike（通过 tag 匹配人名）
    const strikes = await query(`SELECT s.nucleus, s.polarity
     FROM strike s
     JOIN strike_tag st ON st.strike_id = s.id
     WHERE s.user_id = $1 AND st.label = $2 AND s.status = 'active'
     ORDER BY s.created_at DESC
     LIMIT 30`, [person.user_id, person.name]);
    if (strikes.length < 3)
        return [];
    const resp = await chatCompletion([
        {
            role: "system",
            content: `分析以下关于"${person.name}"的记录，提取此人的行为模式和特征。

返回 JSON：{"patterns": ["模式1", "模式2"]}
- 每个模式一句话
- 基于多条记录的共性，非单条推断
- 最多 5 个模式`,
        },
        {
            role: "user",
            content: strikes.map((s) => `[${s.polarity}] ${s.nucleus}`).join("\n"),
        },
    ], { json: true, temperature: 0.3, tier: "background" });
    const parsed = JSON.parse(resp.content);
    const patterns = parsed.patterns ?? [];
    // 保存到 person
    if (patterns.length > 0) {
        await execute(`UPDATE person SET patterns = $1::jsonb, updated_at = NOW() WHERE id = $2`, [JSON.stringify(patterns), personId]);
    }
    return patterns;
}
/**
 * 获取人物画像上下文，用于注入参谋对话。
 */
export async function getPersonContext(userId, personNames) {
    if (personNames.length === 0)
        return [];
    const result = [];
    for (const name of personNames) {
        // 查找 person 记录
        const persons = await query(`SELECT id, name, patterns::text, stats::text
       FROM person WHERE user_id = $1 AND name = $2`, [userId, name]);
        if (persons.length === 0)
            continue;
        const person = persons[0];
        // 最近相关 Strike
        const recentStrikes = await query(`SELECT s.nucleus, s.polarity, s.created_at
       FROM strike s
       JOIN strike_tag st ON st.strike_id = s.id
       WHERE s.user_id = $1 AND st.label = $2 AND s.status = 'active'
       ORDER BY s.created_at DESC
       LIMIT 5`, [userId, name]);
        let patterns = [];
        let stats = {};
        try {
            patterns = JSON.parse(person.patterns) ?? [];
        }
        catch { /* */ }
        try {
            stats = JSON.parse(person.stats) ?? {};
        }
        catch { /* */ }
        result.push({
            name: person.name,
            patterns,
            stats,
            recentStrikes: recentStrikes.map((s) => ({
                nucleus: s.nucleus,
                polarity: s.polarity,
                date: s.created_at.split("T")[0],
            })),
        });
    }
    return result;
}
//# sourceMappingURL=person-profile.js.map