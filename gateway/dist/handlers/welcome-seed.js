/**
 * 欢迎日记种子数据 — 冷启动完成后预存 3 篇日记 + Strike + Bond + Tag。
 *
 * 所有内容硬编码，不走 AI，100% 可控展示。
 * source_type = 'material'，与用户日记样式一致，可删除。
 */
import { recordRepo, transcriptRepo, summaryRepo, strikeRepo, bondRepo, tagRepo, } from "../db/repositories/index.js";
const WELCOME_DIARIES = [
    {
        title: "念念有路 · 功能介绍",
        summary: "念念有路的核心功能——混沌输入、结构涌现、AI 陪伴",
        content: `**念念有路**是你的个人认知操作系统。

你可以把**任何想法**丢进来——散乱的感想、工作计划、读书笔记、生活碎片，甚至一段语音。不需要分类，不需要整理。

**核心能力：**

**混沌输入，自由记录**
支持语音和文字，想到什么说什么。AI 会自动将你的输入拆解为独立的想法（Strike）和待办。

**标签自动生成**
每条记录会被 AI 分析并打上标签，帮你快速回顾。你不需要手动归类。

**相关日记链接**
当你记录的越多，系统会自动发现不同日记之间的关联。看似无关的想法，可能正在指向同一个方向。

**每日回顾**
每天早晨和晚间，路路会为你准备一份简报，汇总你的认知变化和行动进展。

**目标管理**
从你的日常记录中，系统会自动识别出你关注的方向，形成目标和维度。你的目标不是被"设定"的，而是从记录中"长"出来的。

**AI 对话**
有任何想法想深入探讨？随时和路路聊聊。它了解你的所有记录，能给出有上下文的建议。`,
        tags: ["功能介绍", "产品指南"],
        strikes: [
            { nucleus: "语音和文字混沌输入，AI 自动拆解为想法和待办", polarity: "perceive" },
            { nucleus: "标签自动生成，相关日记自动链接", polarity: "perceive" },
            { nucleus: "目标从日常记录中自然涌现，不需要手动设定", polarity: "perceive" },
        ],
    },
    {
        title: "路路诞生的故事",
        summary: "为什么我们要做一个「认知操作系统」",
        content: `你有没有过这样的时刻——

脑子里闪过一个很棒的想法，但转头就忘了。或者做了一个决定，过了几天又犹豫了，因为**忘记了当初为什么这么决定**。

我们每天产生无数想法，但大多数都消失了。偶尔记下来的，也散落在不同的笔记本、备忘录、聊天记录里，再也没有被翻开过。

**路路**就是为了解决这个问题而诞生的。

**不是又一个笔记工具。**
我们不要你整理、分类、建文件夹。你只管往里倒，剩下的交给路路。

**结构会自己长出来。**
当你记录的想法足够多，路路会发现它们之间的联系——哪些想法在指向同一个方向、哪些决定之间存在矛盾、哪些目标正在悄悄浮现。这就是**涌现**。

**AI 不打扰你。**
路路不会时不时跳出来说"你该做这个了"。它安静地在后台工作，只在每日回顾中把发现告诉你。你的想法，你的节奏。

我们相信：**记录不是为了回忆，是为了看见自己的思维模式。**`,
        tags: ["路路的故事", "产品理念"],
        strikes: [
            { nucleus: "想法消失的问题——闪念即逝，决策遗忘", polarity: "realize" },
            { nucleus: "结构从记录密度中自然涌现，不需要手动分类", polarity: "realize" },
            { nucleus: "记录不是为了回忆，是为了看见自己的思维模式", polarity: "realize" },
        ],
    },
    {
        title: "创始人的信",
        summary: "写给每一位用户的信——关于念念有路的初心",
        content: `你好，

感谢你来到**念念有路**。

我做这个产品的原因很简单——我自己就是那个**想法很多但总是执行不了的人**。

我试过各种工具：待办清单、日记本、思维导图、项目管理软件。它们都很好，但都有一个问题——**需要我先想清楚，再去记录**。可是很多时候，我还没想清楚啊。我只是有一个模糊的念头，一个不成熟的想法，一个隐约的不安。

这些"混沌"的东西，没有工具愿意接收它们。

所以我做了**念念有路**。你不需要想清楚再记录。**先记下来，结构会慢慢浮现。**

当前版本还在早期，很多功能还在打磨中。但核心链路已经可以用了：

- ✅ 语音/文字随时记录
- ✅ AI 自动拆解想法和待办
- ✅ 标签和关联自动生成
- ✅ 每日回顾
- ✅ 目标自然涌现
- ✅ AI 对话（有上下文的）

**更多能力正在路上：** 认知地图、大师视角、行动复盘……

如果你在使用中遇到任何问题，或者有任何想法，随时告诉路路。

祝你在念念有路中，找到从想法到行动的路。

—— 创始人`,
        tags: ["创始人", "写给你的信"],
        strikes: [
            { nucleus: "混沌的想法没有工具愿意接收，所以做了念念有路", polarity: "realize" },
            { nucleus: "不需要想清楚再记录，先记下来，结构会慢慢浮现", polarity: "realize" },
        ],
    },
];
// Bond 定义：日记之间的关联
const WELCOME_BONDS = [
    { sourceIdx: 0, targetIdx: 1, type: "context_of", strength: 0.7 },
    { sourceIdx: 1, targetIdx: 2, type: "resonance", strength: 0.6 },
];
// ─── 核心逻辑 ────────────────────────────────────────────
/**
 * 预存欢迎日记到数据库。幂等——如已存在则跳过。
 */
export async function seedWelcomeDiaries(userId, deviceId) {
    // 幂等检查：查找该用户是否已有 source_type='material' 的 record
    const { query } = await import("../db/pool.js");
    const materialRows = await query(`SELECT id FROM record WHERE user_id = $1 AND source_type = 'material' LIMIT 1`, [userId]);
    if (materialRows.length > 0) {
        console.log("[welcome-seed] Already seeded for user, skipping");
        return { created: 0 };
    }
    const now = Date.now();
    const recordIds = [];
    // strikeId 收集，用于创建跨日记 Bond
    const strikeIdsByDiary = [];
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
        const diaryStrikeIds = [];
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
        if (!sourceStrikes?.length || !targetStrikes?.length)
            return [];
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
//# sourceMappingURL=welcome-seed.js.map