/**
 * topics-wiki-helpers — wiki page content 解析工具
 *
 * 从 wiki page 的 markdown content 中提取 seeds（种子段落）和 harvest（收获段落）。
 * 排除 "## 目标" 和 "## 子页索引" 等结构性段落。
 */

import { randomUUID } from "node:crypto";

export interface WikiSeed {
  id: string;
  content: string;
  type: "section";
}

export interface WikiHarvestParagraph {
  id: string;
  content: string;
}

/** 需要从 seeds 中排除的段落标题（完全匹配） */
const EXCLUDED_SEED_SECTIONS = ["目标", "子页索引"];

/** harvest 段落来源的节标题 */
const HARVEST_SECTION = "关键决策链";

/**
 * 将 wiki page content（markdown）按 ## 标题切分成段落
 * 返回 [{heading, body}] 数组
 */
function splitSections(content: string): Array<{ heading: string; body: string }> {
  if (!content.trim()) return [];

  const lines = content.split("\n");
  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      // 保存上一个段落
      if (currentHeading || currentBody.length > 0) {
        const bodyText = currentBody.join("\n").trim();
        if (currentHeading && bodyText) {
          sections.push({ heading: currentHeading, body: bodyText });
        }
      }
      currentHeading = headingMatch[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // 保存最后一个段落
  if (currentHeading) {
    const bodyText = currentBody.join("\n").trim();
    if (bodyText) {
      sections.push({ heading: currentHeading, body: bodyText });
    }
  }

  return sections;
}

/**
 * 从 wiki page content 中解析 seed 段落
 * 排除"目标"和"子页索引"段落，其余段落作为 seeds
 */
export function parseWikiSeeds(content: string): WikiSeed[] {
  const sections = splitSections(content);
  return sections
    .filter(s => !EXCLUDED_SEED_SECTIONS.includes(s.heading))
    .map(s => ({
      id: randomUUID(),
      content: s.body,
      type: "section" as const,
    }));
}

/**
 * 从 wiki page content 中提取收获段落
 * 只从 "## 关键决策链" 段落中提取
 */
export function parseWikiHarvest(content: string): WikiHarvestParagraph[] {
  const sections = splitSections(content);
  const harvestSection = sections.find(s => s.heading === HARVEST_SECTION);
  if (!harvestSection) return [];

  // 将决策链段落按段分割（双换行或单行非空）
  const paragraphs = harvestSection.body
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(Boolean);

  return paragraphs.map(p => ({
    id: randomUUID(),
    content: p,
  }));
}
