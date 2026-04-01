/**
 * 欢迎日记种子数据 — 冷启动完成后预存 3 篇日记 + Strike + Bond + Tag。
 *
 * 所有内容硬编码，不走 AI，100% 可控展示。
 * source_type = 'material'，与用户日记样式一致，可删除。
 */

import {
  recordRepo,
  transcriptRepo,
  summaryRepo,
  strikeRepo,
  bondRepo,
  tagRepo,
} from "../db/repositories/index.js";

// ─── 欢迎日记内容定义 ─────────────────────────────────────

interface WelcomeDiary {
  title: string;
  summary: string;
  content: string;
  tags: string[];
  strikes: Array<{
    nucleus: string;
    polarity: "perceive" | "realize";
  }>;
}

const WELCOME_DIARIES: WelcomeDiary[] = [
  {
    title: "写给你的信",
    summary: "为什么要做这个产品",
    content: `亲爱的朋友，

谢谢你来到念念有路。

先说句大实话：我不是程序员。大学专业和编程八竿子打不着，唯一沾边的是大一那门 C 语言——期末突击勉强及格的那种。毕业后一直在上班，做着和代码完全无关的工作。到今天，我依然是一个每天按时打卡的上班族。

念念有路，是我下班之后、周末假日，一点一点拼出来的。

做这个东西，是因为我自己有一个很痛的问题——脑子想得挺多，执行的时候总是丢三落四。很多事到了 deadline 才猛然想起来，或者领导问了、下游催了，才恍然："哦对，还有这件事！"然后手忙脚乱赶工，心里既懊悔又焦虑。

我试过各种工具。微软 To-Do、滴答清单、番茄钟，甚至用 Excel 做甘特图管理日程。没有一个坚持超过两周。不是它们不好，是它们对我这种人太重了——每天花大量时间录入、分类、调优先级，"管理自己"本身变成了比工作还大的负担。

今年 AI agent爆发，让很多原本不可能的事成为可能，我就想，为什么我不能做一个东西——我只管动动嘴，它帮我记下来、整理好、到时间提醒我？

就这样，念念有路诞生了。

名字取的是"念念不忘，必有回响；念念有路，自有方向"——每一个闪过脑海的念头，都不应该白白溜走。

后来我把它放到小红书上，没有多少人关注，那个号还因为openclaw扫数据被禁言了。就在那些一天三十几个阅读量里，竟然有人主动找来说想试试。

那一刻我真的感动。一个不会写代码也不会做内容的人，做了一个还没完工的东西，居然有人愿意相信。

后来多亏有小伙伴加入，才得以让更多人看到。

坦诚说，你现在拿到的是一个 0.1 版本。很多功能还不完善，有些地方还粗糙。但核心链路已经跑通了：你说话，AI 帮你记下来、拆成待办。更多的能力——到时间体现，知识图谱，深度复盘、行动追踪——都在路上。

我想要打造一个致力于从认知到行动的app,很多想法就算你眼前没有行动，但只要你还在持续的思考，持续累计，持续的记录，终有一天会变为行动；

如果遇到任何问题，或者有什么想法，可以在微信/小红书群里联系。

谢谢你愿意在这么早的阶段就加入。

愿你每个念头都被看到和发现，
——念念有路团队
2026 年 4 月`,
    tags: ["写给你的信"],
    strikes: [
      { nucleus: "脑子想得多但执行丢三落四，试过各种工具都坚持不下来", polarity: "realize" },
      { nucleus: "AI 让动动嘴就能把想法记住整理好成为可能", polarity: "realize" },
    ],
  },
  {
    title: "三分钟上手念念有路",
    summary: "录入、管理、对话——所有操作一看就会",
    content: `这篇教你怎么用。三分钟看完，马上上手。

【录入：说出来就行】

底部中间那个大按钮就是录入口。

点一下，弹出文字输入框，直接打字。
长按，开始语音录入——说完松手就自动保存。
向左滑 → 取消
向右滑 → 常驻录音

录进去的内容，路路会帮你拆：里面提到的待办自动建好，标签自动打上，日记自动归档。你不用管分类的事。

【待办】

点进去可以改时间、改内容、删除。

首页上方的日期条可以点击，切换不同日期看当天的待办。

【对话：输入 / 触发技能】

点右下角进入对话。路路了解你所有的记录，直接聊就行。

在输入框打 / 会弹出技能列表，比如：
/review — 发起复盘

你也可以直接用自然语言让路路帮你干活："帮我加个待办，明天下午三点开会"。

【日记：自动生成，可以管理】

你录入的内容会自动变成日记，不需要手动写。

在日记页面，长按某篇日记可以重命名或删除。

如果想按笔记本分组管理，长按笔记本标题可以编辑或删除整个笔记本。

【其他小技巧】

- 设置可以切换深色/浅色模式
- 每天早上会收到今日简报，晚上会有回顾提醒
- 路路会随着你用得越多越了解你，不需要额外设置`,
    tags: ["功能介绍"],
    strikes: [
      { nucleus: "点一下打字、长按说话，录入零门槛", polarity: "perceive" },
      { nucleus: "左滑完成、右滑常驻、输入/触发技能——三个手势搞定日常", polarity: "perceive" },
    ],
  },
  {
    title: "当前版本说明",
    summary: "v0.1 能做什么、还不能做什么",
    content: `你拿到的是 v0.1 版本。跟你说清楚现在的状态。

已经能用的：
- 语音和文字随时记录，想到什么说什么
- AI 自动拆解想法，提取待办
- 标签和日记关联自动生成
- 每日晨间简报和晚间回顾
- 和路路对话，它了解你所有的记录
- 目标从你的日常记录中自然涌现


还在做的：
- 涌现后的结构筛选
- 多模态输入
- MCP
- 认知地图（你的思维全景图）
- 鸿蒙版
- IOS端
- PC 端（Windows /mac）

我知道目前还有很多未知的问题。

但我们不会停。

因为这个世界上一定有很多跟我们一样的人——脑子里装满了想法，但手上总是漏掉事情。如果念念有路能帮到哪怕一个这样的人，那这些下班后熬过的夜就都值了。

如果你在使用中遇到 bug 或者有任何建议，请在微信群里联系

你的每一条反馈，都是这个产品往前走的动力和更好的可能。`,
    tags: ["版本说明"],
    strikes: [
      { nucleus: "v0.1 核心链路已通：语音记录→待办提取→每日回顾→AI对话", polarity: "perceive" },
      { nucleus: "用户反馈是产品往前走的燃料", polarity: "realize" },
    ],
  },
];

// Bond 定义：日记之间的关联
const WELCOME_BONDS: Array<{
  sourceIdx: number;
  targetIdx: number;
  type: string;
  strength: number;
}> = [
  { sourceIdx: 0, targetIdx: 1, type: "context_of", strength: 0.7 },
  { sourceIdx: 0, targetIdx: 2, type: "context_of", strength: 0.6 },
];

// ─── 核心逻辑 ────────────────────────────────────────────

/**
 * 预存欢迎日记到数据库。幂等——如已存在则跳过。
 */
export async function seedWelcomeDiaries(
  userId: string,
  deviceId: string,
): Promise<{ created: number }> {
  // 幂等检查：查找该用户是否已有 source_type='material' 的 record
  const { query } = await import("../db/pool.js");
  const materialRows = await query<{ id: string }>(
    `SELECT id FROM record WHERE user_id = $1 AND source_type = 'material' LIMIT 1`,
    [userId],
  );
  if (materialRows.length > 0) {
    console.log("[welcome-seed] Already seeded for user, skipping");
    return { created: 0 };
  }

  const now = Date.now();
  const recordIds: string[] = [];
  // strikeId 收集，用于创建跨日记 Bond
  const strikeIdsByDiary: string[][] = [];

  for (let i = 0; i < WELCOME_DIARIES.length; i++) {
    const diary = WELCOME_DIARIES[i];
    // 时间戳间隔 1 分钟，最早的日记排在前面
    const createdAt = new Date(now - (WELCOME_DIARIES.length - 1 - i) * 60_000).toISOString();

    // 1. 创建 record（source 必须是 'voice'|'manual'，受 DB CHECK 约束）
    const record = await recordRepo.create({
      device_id: deviceId,
      user_id: userId,
      status: "completed",
      source: "manual",
      source_type: "material",
    });
    recordIds.push(record.id);

    // 手动更新 created_at 以控制排序
    await recordRepo.updateCreatedAt(record.id, createdAt);

    // 2. 写入 transcript
    await transcriptRepo.create({
      record_id: record.id,
      text: diary.content,
    });

    // 3. 写入 summary（前端读取 short_summary 展示）
    await summaryRepo.create({
      record_id: record.id,
      title: diary.title,
      short_summary: diary.summary,
      long_summary: diary.content,
    });

    // 4. 预存标签 → tag + record_tag
    for (const label of diary.tags) {
      const tag = await tagRepo.upsert(label);
      await tagRepo.addToRecord(record.id, tag.id);
    }

    // 5. 预存 Strike
    const diaryStrikeIds: string[] = [];
    for (const s of diary.strikes) {
      const strike = await strikeRepo.create({
        user_id: userId,
        nucleus: s.nucleus,
        polarity: s.polarity,
        source_id: record.id,
        source_type: "material",
        confidence: 0.9,
        salience: 0.2, // material 降权
      });
      diaryStrikeIds.push(strike.id);
    }
    strikeIdsByDiary.push(diaryStrikeIds);
  }

  // 6. 预存跨日记 Bond
  const bondsToCreate = WELCOME_BONDS.flatMap((b) => {
    const sourceStrikes = strikeIdsByDiary[b.sourceIdx];
    const targetStrikes = strikeIdsByDiary[b.targetIdx];
    if (!sourceStrikes?.length || !targetStrikes?.length) return [];
    // 用各日记的第一个 Strike 代表日记建立关联
    return [{
      source_strike_id: sourceStrikes[0],
      target_strike_id: targetStrikes[0],
      type: b.type,
      strength: b.strength,
      created_by: "welcome-seed",
    }];
  });

  if (bondsToCreate.length > 0) {
    await bondRepo.createMany(bondsToCreate);
  }

  console.log(`[welcome-seed] Created ${WELCOME_DIARIES.length} welcome diaries with tags, strikes, and bonds`);
  return { created: WELCOME_DIARIES.length };
}
