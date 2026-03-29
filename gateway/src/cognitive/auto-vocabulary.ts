/**
 * 自动词汇收集 — 从用户近期记录中提取高频领域词汇
 * domain-vocabulary spec 场景 5
 *
 * 逻辑：
 * 1. 查询最近 7 天的 transcript
 * 2. 提取 2-4 字中文词汇
 * 3. 统计词频，过滤常用词
 * 4. 将 freq >= 3 且不在现有词库中的词汇自动入库
 */

import { query } from "../db/pool.js";
import * as vocabularyRepo from "../db/repositories/vocabulary.js";

// 常用中文停用词（精简版，避免将常见词误收为领域词汇）
const COMMON_WORDS = new Set([
  // 代词
  "我们", "你们", "他们", "自己", "什么", "这个", "那个", "这些", "那些", "哪个",
  "大家", "别人", "其他", "每个", "所有", "一些", "很多", "不少",
  // 时间
  "今天", "明天", "昨天", "现在", "以后", "之前", "时候", "已经", "马上", "一直",
  "最近", "后来", "刚才", "平时", "经常", "有时", "偶尔", "每天", "上午", "下午",
  "晚上", "早上", "周末",
  // 动词/助词
  "可以", "应该", "需要", "能够", "知道", "觉得", "认为", "希望", "感觉", "看到",
  "听到", "告诉", "帮忙", "开始", "结束", "继续", "完成", "准备", "打算", "喜欢",
  "不要", "没有", "不是", "就是", "但是", "因为", "所以", "如果", "虽然", "或者",
  "而且", "然后", "不过", "只是", "还是", "已经", "可能", "一定", "应该", "必须",
  // 形容词
  "重要", "简单", "复杂", "特别", "非常", "比较", "一般", "正常", "主要", "基本",
  "直接", "具体", "实际", "最后", "首先", "然后",
  // 量词/数词
  "一个", "两个", "三个", "几个", "第一", "第二", "第三",
  // 连词/介词
  "关于", "对于", "通过", "根据", "按照", "为了",
  // 其他高频词
  "问题", "东西", "事情", "方面", "情况", "地方", "部分", "方法", "过程",
]);

/** 从文本中提取 2-4 字中文词汇 */
function extractChineseWords(text: string): string[] {
  // 匹配连续中文字符段（≥2字）
  const segments = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const words: string[] = [];

  for (const seg of segments) {
    // 滑动窗口提取 2-4 字组合
    for (let len = 2; len <= Math.min(4, seg.length); len++) {
      for (let i = 0; i <= seg.length - len; i++) {
        words.push(seg.slice(i, i + len));
      }
    }
  }

  return words;
}

/** 自动收集词汇，返回新增词汇数 */
export async function autoCollectVocabulary(deviceId: string, userId?: string): Promise<number> {
  try {
    // 1. 查询最近 7 天的 transcript 文本
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const rows = await query<{ text: string }>(
      `SELECT t.text FROM transcript t
       JOIN record r ON r.id = t.record_id
       WHERE r.device_id = $1 AND r.created_at >= $2 AND t.text IS NOT NULL`,
      [deviceId, sevenDaysAgo],
    );

    if (rows.length === 0) return 0;

    // 2. 提取词汇并统计频率
    const freqMap = new Map<string, number>();
    for (const row of rows) {
      const words = extractChineseWords(row.text);
      for (const w of words) {
        if (!COMMON_WORDS.has(w)) {
          freqMap.set(w, (freqMap.get(w) || 0) + 1);
        }
      }
    }

    // 3. 过滤 freq >= 3 的候选词
    const candidates = Array.from(freqMap.entries())
      .filter(([_, freq]) => freq >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20); // 每次最多处理 20 个

    if (candidates.length === 0) return 0;

    // 4. 获取现有词汇，排除已存在的
    const existing = await vocabularyRepo.findByDevice(deviceId);
    const existingTerms = new Set(existing.map((e) => e.term));
    // 也排除已有词汇的别名
    for (const e of existing) {
      for (const alias of e.aliases ?? []) {
        existingTerms.add(alias);
      }
    }

    // 5. 插入新词汇
    let added = 0;
    for (const [term, _freq] of candidates) {
      if (existingTerms.has(term)) continue;

      try {
        await vocabularyRepo.create({
          deviceId,
          userId: userId ?? null,
          term,
          domain: "auto", // 自动收集的词汇暂时归入 auto 领域
          source: "auto",
        });
        existingTerms.add(term); // 防止同批次重复
        added++;
      } catch {
        // 忽略插入冲突（如并发收集）
      }
    }

    if (added > 0) {
      console.log(`[auto-vocabulary] Device ${deviceId}: added ${added} new terms`);
    }

    return added;
  } catch (err: any) {
    console.error(`[auto-vocabulary] Failed for device ${deviceId}:`, err.message);
    return 0;
  }
}
