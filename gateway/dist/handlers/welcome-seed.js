/**
 * 欢迎日记种子数据 — 冷启动完成后预存 3 篇日记 + Strike + Bond + Tag。
 *
 * 所有内容硬编码，不走 AI，100% 可控展示。
 * source_type = 'material'，与用户日记样式一致，可删除。
 */
import { recordRepo, transcriptRepo, summaryRepo, strikeRepo, bondRepo, tagRepo, } from "../db/repositories/index.js";
const WELCOME_DIARIES = [
    {
        title: "写给你的信",
        summary: "一个不会编程的上班族，为什么下班后要做这个产品",
        content: `亲爱的朋友，

谢谢你来到念念有路。

先说句大实话：我不是程序员。大学专业和编程八竿子打不着，唯一沾边的是大一那门 C 语言——期末突击勉强及格的那种。毕业后一直在上班，做着和代码完全无关的工作。到今天，我依然是一个每天按时打卡的上班族。

念念有路，是我下班之后、周末假日，一点一点拼出来的。

做这个东西，是因为我自己有一个很痛的问题——脑子想得挺多，执行的时候总是丢三落四。很多事到了 deadline 才猛然想起来，或者领导问了、下游催了，才恍然："哦对，还有这件事！"然后手忙脚乱赶工，心里既懊悔又焦虑。

我试过各种工具。微软 To-Do、滴答清单、番茄钟，甚至用 Excel 做甘特图管理日程。没有一个坚持超过两周。不是它们不好，是它们对我这种人太重了——每天花大量时间录入、分类、调优先级，"管理自己"本身变成了比工作还大的负担。

今年 AI 爆发，我忽然想到：既然 AI 已经能理解我说的话，为什么我不能做一个东西——我只管动动嘴，它帮我记下来、整理好、到时间提醒我？

就这样，念念有路诞生了。

名字取的是"念念不忘，必有回响；念念有路，自有方向"——每一个闪过脑海的念头，都不应该白白溜走。

后来我把它放到小红书上。说来惭愧，我完全不会做运营，自己用 AI 跑的几个号全被封了。后来是小伙伴加入帮忙，才让更多人看到。就在那些一天三十几个阅读量里，竟然有人主动找来说想试试。

那一刻我真的感动。一个不会写代码也不会做内容的人，做了一个还没完工的东西，居然有人愿意相信。

坦诚说，你现在拿到的是一个 0.1 版本。很多功能还不完善，有些地方还粗糙。但核心链路已经跑通了：你说话，AI 帮你记下来、拆成待办、到时间提醒你。更多的能力——深度复盘、行动追踪——都在路上。

如果遇到任何问题，或者有什么想法，直接在 App 里告诉路路就好。

谢谢你愿意在这么早的阶段就加入。

愿你每个念头都被觉察，都被收集，都被看到和发现，都会在未来的路上看到价值。

——念念有路团队
2026 年 4 月`,
        tags: ["写给你的信"],
        strikes: [
            { nucleus: "脑子想得多但执行丢三落四，试过各种工具都坚持不下来", polarity: "realize" },
            { nucleus: "AI 让动动嘴就能把想法记住整理好成为可能", polarity: "realize" },
        ],
    },
    {
        title: "念念有路能帮你做什么",
        summary: "说出来的每一句话，都会变为行动",
        content: `念念有路做一件事：你负责想，它负责干。

你可以把任何想法丢进来——散乱的感想、工作安排、读书心得、生活碎片，甚至只是一段语音牢骚。不需要分类，不需要整理，不需要想清楚再说。

说出来就好。剩下的交给路路。

它会帮你做这些事：

把你说的话拆成待办。"下午三点找张总确认报价，顺便让小李整理个备选清单"——这句话会自动变成两条待办，带时间、带关联。

自动打标签和建关联。你不需要手动归类。记得越多，系统越能发现不同记录之间的联系——两周前的一个想法和今天的一个决定，可能正在指向同一个方向。

每天给你一份简报。早上告诉你今天该做什么，晚上帮你回顾今天的思考和行动。不是 AI 在教你做事，是它帮你看见自己。

有一件事路路不会做：它不会替你思考，不会帮你润色笔记。

你说"卧槽这个方案有问题"，它就原样记下"卧槽这个方案有问题"。因为如果连原始的想法都不敢面对，后续所有的决策都建立在虚假的基础上，不会有好的结果。

路路是一个干活的助手，不是一个说教的老师。`,
        tags: ["功能介绍"],
        strikes: [
            { nucleus: "你负责想，路路负责干——拆待办、打标签、建关联、做简报", polarity: "perceive" },
            { nucleus: "不润色不美化，原始输入是一切决策的真实基础", polarity: "realize" },
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
- 认知地图（你的思维全景图）
- PC 端（Windows / macOS）

还在做的：
- 按目标和领域分组的待办管理
- 更准确的语音识别（不同口音和行业术语）
- 鸿蒙版

说一件我低估的事情：AI 在小功能上用起来很顺，但项目变大后开发难度是指数级增长的。一个不会编程的人驾驭这些，确实比我想象的难太多。

但我不会停。

因为这个世界上一定有很多跟我一样的人——脑子里装满了想法，但手上总是漏掉事情。如果念念有路能帮到哪怕一个这样的人，那这些下班后熬过的夜就都值了。

如果你在使用中遇到 bug 或者有任何建议，直接在 App 里说就行——路路会记下来，我会看到。

你的每一条反馈，都是这个产品往前走的燃料。`,
        tags: ["版本说明"],
        strikes: [
            { nucleus: "v0.1 核心链路已通：语音记录→待办提取→每日回顾→AI对话→认知地图", polarity: "perceive" },
            { nucleus: "用户反馈是产品往前走的燃料", polarity: "realize" },
        ],
    },
];
// Bond 定义：日记之间的关联
const WELCOME_BONDS = [
    { sourceIdx: 0, targetIdx: 1, type: "context_of", strength: 0.7 },
    { sourceIdx: 0, targetIdx: 2, type: "context_of", strength: 0.6 },
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