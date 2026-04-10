/**
 * topics-wiki-helpers — wiki page content 解析工具
 *
 * 从 wiki page 的 markdown content 中提取 seeds（种子段落）和 harvest（收获段落）。
 * 排除 "## 目标" 和 "## 子页索引" 等结构性段落。
 */
export interface WikiSeed {
    id: string;
    content: string;
    type: "section";
}
export interface WikiHarvestParagraph {
    id: string;
    content: string;
}
/**
 * 从 wiki page content 中解析 seed 段落
 * 排除"目标"和"子页索引"段落，其余段落作为 seeds
 */
export declare function parseWikiSeeds(content: string): WikiSeed[];
/**
 * 从 wiki page content 中提取收获段落
 * 只从 "## 关键决策链" 段落中提取
 */
export declare function parseWikiHarvest(content: string): WikiHarvestParagraph[];
