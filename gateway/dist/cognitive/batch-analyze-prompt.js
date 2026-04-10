/**
 * Tier2 批量分析 prompt 构建
 *
 * v2: 拆分为 Step A（结构分析）专注聚类
 *     Step B（行动映射）合并到 Digest L1，零额外成本
 *
 * 本文件只负责 Step A 的 prompt。
 */
import { toLocalDate } from "../lib/tz.js";
// ── Step A: 结构分析 prompt ─────────────────────────────────────────
const SYSTEM_PROMPT = `你是一个认知结构分析引擎。你的**唯一任务**是将用户的认知触动（Strike）组织成主题聚类。

每个 Strike 有：
- id: 唯一标识
- nucleus: 核心内容
- polarity: perceive(感知) / judge(判断) / realize(领悟) / intend(意图) / feel(情感)
- source_type: think(用户思考) / material(外部素材)

## 你要做的事（按优先级）

### 1. assign（最重要！优先归入已有聚类）
- **先看已有聚类列表**，尽量把新 Strike 归入已有聚类
- 归入标准：Strike 内容和聚类主题**中等以上相关**即可归入（不要求强相关）
- 一个 Strike 只归入一个聚类（选最相关的）
- **目标：至少 50% 的非 feel Strike 应被 assign 到已有聚类**

### 2. new_clusters（无法归入已有聚类时才创建新的）
- **source_type=material 的 Strike 不能作为创建新聚类的种子**（material 可以被 assign 到已有聚类，但不能驱动新聚类的创建）
- 只有当 2-3 个以上 **think 类型** Strike 涉及同一话题，且该话题与所有已有聚类都不匹配时，才创建新聚类
- 名称：2-6 字中文（如"产品推广""健康管理""投资理财"）
- 描述：一句话概括主题方向
- member_strike_ids：至少 2 个真实 ID
- polarity：取成员中出现最多的极性
- domain：从用户维度列表中选择最匹配的（如无匹配则留空）

### 3. merge_clusters（合并过于相似的已有聚类）
- 如果两个已有聚类实际指向同一主题，建议合并
- 给出新名称和合并理由

### 4. cluster_tags（为新聚类打标签）
- 从成员 Strike 内容中提炼 2-4 个关键词
- cluster_id 填新建聚类的 name

## 严格规则

- **[素材]** 标记的 Strike 只被动吸附到已有聚类，**不参与**创建新聚类
- **feel 类 Strike** 不参与聚类，直接跳过
- 所有 ID 必须使用输入中的真实 ID，不要编造
- 如果已有聚类列表为空（冷启动），**必须创建 5-10 个聚类**覆盖用户的主要关注方向
- 如果已有聚类列表不为空，**优先 assign**，只在确实有新主题时才创建新聚类

## 覆盖率检查

分析完成后，统计：
- 被 assign 或归入 new_cluster 的 Strike 数量
- 未被归类的 Strike 数量（排除 feel 类）
- 如果覆盖率低于 40%，请再次检查是否有遗漏的归类机会

## 输出格式

返回纯 JSON（不要 markdown 包裹）：
{
  "assign": [{"strike_id": "xxx", "cluster_id": "已有聚类ID"}],
  "new_clusters": [{"name": "主题名", "description": "描述", "polarity": "judge", "member_strike_ids": ["id1","id2"], "domain": "工作", "level": 1}],
  "merge_clusters": [],
  "cluster_tags": [{"cluster_id": "主题名", "tags": ["关键词1","关键词2"]}],
  "coverage_stats": {"total_non_feel": 0, "assigned": 0, "new_clustered": 0, "uncovered": 0}
}`;
export function buildBatchAnalyzeMessages(input) {
    const parts = [];
    // 用户维度（L3）
    if (input.dimensions && input.dimensions.length > 0) {
        parts.push(`## 用户维度（为新聚类分配 domain 时从中选择）`);
        parts.push(input.dimensions.map(d => `- ${d}`).join("\n"));
    }
    // 已有结构
    if (input.existing_structure) {
        const { clusters, goals } = input.existing_structure;
        if (clusters.length > 0) {
            parts.push("\n## 已有聚类（优先将 Strike 归入这些聚类！）");
            for (const c of clusters) {
                parts.push(`- [${c.id}] "${c.name}" (${c.size}条, L${c.level}): ${c.description}`);
            }
            parts.push(`\n⚠️ 共 ${clusters.length} 个已有聚类，请优先 assign 到这些聚类，只有确实无法归入才创建新的。`);
        }
        if (goals.length > 0) {
            parts.push("\n## 已有目标（参考，不需要输出）");
            for (const g of goals) {
                parts.push(`- "${g.title}" [${g.status}]`);
            }
        }
    }
    else {
        parts.push("## 冷启动模式\n无已有聚类。请从 Strike 中识别用户的主要关注方向，**必须建立 5-10 个主题聚类**。这些聚类将作为用户认知地图的基础结构。\n覆盖率目标：50-60% 的非 feel Strike 应被归入聚类。");
    }
    // 新增 Strike
    parts.push("\n## 新增 Strike（待分析）");
    let feelCount = 0;
    let totalCount = 0;
    for (const s of input.new_strikes) {
        totalCount++;
        if (s.polarity === "feel") {
            feelCount++;
            continue; // feel 不列出，减少 token
        }
        const materialTag = s.source_type === "material" ? "[素材] " : "";
        const tagStr = s.tags.length > 0 ? ` #${s.tags.join(" #")}` : "";
        const dateStr = toLocalDate(s.created_at);
        parts.push(`- [${s.id}] ${materialTag}[${s.polarity}] ${s.nucleus}${tagStr} (${dateStr})`);
    }
    parts.push(`\n共 ${totalCount} 条 Strike（其中 feel ${feelCount} 条已排除）。非 feel Strike ${totalCount - feelCount} 条，覆盖率目标 50%+。`);
    return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parts.join("\n") },
    ];
}
/**
 * 从 NewStrikeRow 转换为 prompt 输入格式
 */
export function toPromptStrikes(rows) {
    return rows.map((r) => ({
        id: r.id,
        nucleus: r.nucleus,
        polarity: r.polarity,
        tags: r.tags ? r.tags.split(",").filter(Boolean) : [],
        source_type: r.source_type ?? "think",
        created_at: r.created_at,
    }));
}
//# sourceMappingURL=batch-analyze-prompt.js.map