/**
 * L2 涌现 — 从 L1 Cluster 聚合为 L2 大主题
 *
 * 条件：3+ 个 L1 两两之间有 bond (strength > 0.6)
 * AI 审核后创建 L2 Cluster，L1 通过 bond.type='cluster_member' 归入
 */

import { chatCompletion, type ChatMessage } from "../ai/provider.js";
import { strikeRepo, bondRepo } from "../db/repositories/index.js";
import type { StrikeEntry } from "../db/repositories/strike.js";

interface ClusterBond {
  source: string;
  target: string;
  strength: number;
}

interface L2Result {
  created: number;
}

const MIN_BOND_STRENGTH = 0.6;
const MIN_CLUSTER_SIZE = 3;

/**
 * 发现并创建 L2 Cluster
 */
export async function discoverL2Clusters(
  userId: string,
  l1Clusters: StrikeEntry[],
  clusterBonds: ClusterBond[],
): Promise<L2Result> {
  if (l1Clusters.length < MIN_CLUSTER_SIZE) {
    return { created: 0 };
  }

  // 构建邻接表（只保留强 bond）
  const adj = new Map<string, Set<string>>();
  for (const c of l1Clusters) adj.set(c.id, new Set());

  for (const b of clusterBonds) {
    if (b.strength < MIN_BOND_STRENGTH) continue;
    adj.get(b.source)?.add(b.target);
    adj.get(b.target)?.add(b.source);
  }

  // 寻找全连通子图（至少 3 个节点）
  const visited = new Set<string>();
  const groups: string[][] = [];

  for (const c of l1Clusters) {
    if (visited.has(c.id)) continue;

    const neighbors = adj.get(c.id);
    if (!neighbors || neighbors.size < 2) continue;

    // BFS 找连通分量
    const group: string[] = [];
    const queue = [c.id];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      group.push(cur);

      for (const nb of adj.get(cur) ?? []) {
        if (!visited.has(nb)) queue.push(nb);
      }
    }

    if (group.length >= MIN_CLUSTER_SIZE) {
      groups.push(group);
    } else {
      for (const id of group) visited.delete(id);
    }
  }

  if (groups.length === 0) return { created: 0 };

  let created = 0;
  const clusterMap = new Map(l1Clusters.map((c) => [c.id, c]));

  for (const group of groups) {
    const members = group
      .map((id) => clusterMap.get(id))
      .filter((c): c is StrikeEntry => c !== undefined);

    // AI 审核
    const list = members.map((c, i) => `${i + 1}. ${c.nucleus}`).join("\n");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `以下是几个相关主题。判断它们是否属于同一个更大方向。
如果是，给出大方向名称和简要描述。返回 JSON: {"valid": true/false, "name": "方向名", "description": "描述"}`,
      },
      { role: "user", content: list },
    ];

    try {
      const resp = await chatCompletion(messages, { json: true, temperature: 0.3 });
      const verdict = JSON.parse(resp.content);

      if (!verdict.valid || !verdict.name) continue;

      // 创建 L2 Cluster
      const l2 = await strikeRepo.create({
        user_id: userId,
        nucleus: `[${verdict.name}] ${verdict.description ?? ""}`,
        polarity: "perceive",
        is_cluster: true,
        confidence: 0.7,
        salience: 1.0,
        source_type: "clustering",
        level: 2,
        origin: "emerged",
      });

      // L1 归入 L2
      await bondRepo.createMany(
        group.map((id) => ({
          source_strike_id: l2.id,
          target_strike_id: id,
          type: "cluster_member",
          strength: 1.0,
          created_by: "emergence",
        })),
      );

      created++;
      console.log(`[l2-emergence] Created L2 "${verdict.name}" with ${group.length} L1 members`);
    } catch (err) {
      console.error("[l2-emergence] AI review failed:", err);
    }
  }

  return { created };
}
