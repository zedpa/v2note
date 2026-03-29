/**
 * 心情计算引擎
 * ai-companion-window spec 场景 3.1 + 6.2
 */
const MOOD_TEXT = {
    happy: "开心",
    curious: "好奇",
    worried: "担心",
    missing: "想念",
    caring: "心疼",
    focused: "专注",
    calm: "平静",
};
const MOOD_INSTRUCTIONS = {
    happy: "你现在心情不错，可以轻松活泼地聊天，多用口语化表达",
    curious: "你发现了一些有趣的东西，可以主动分享发现，语气带着好奇",
    worried: "你有些担心用户的状态，用温和关切的语气，不要说教，先问问用户是否遇到困难",
    missing: "你有一段时间没见到用户了，表达一下想念，但不要过度",
    caring: "用户很晚还在忙，温柔提醒注意休息，不要唠叨",
    focused: "你正在集中处理任务，回答简短高效",
    calm: "正常温和的语气交流",
};
/**
 * 按优先级计算心情
 */
export function computeMood(ctx) {
    let mood = "calm";
    // 按优先级从高到低
    if (ctx.isDigestRunning) {
        mood = "focused";
    }
    else if (ctx.currentHour >= 23 || ctx.currentHour < 5) {
        mood = "caring";
    }
    else if (ctx.hoursSinceLastRecord >= 48) {
        mood = "missing";
    }
    else if (ctx.hasSkippedTodo) {
        mood = "worried";
    }
    else if (ctx.hasNewCluster) {
        mood = "curious";
    }
    else if (ctx.completedTodayCount >= 3) {
        mood = "happy";
    }
    return {
        mood,
        moodText: MOOD_TEXT[mood],
        moodInstruction: MOOD_INSTRUCTIONS[mood],
    };
}
/**
 * 生成注入 system prompt 的心情段落
 * 供 chat handler 使用
 */
export function buildMoodPromptSection(result, statusSummary) {
    return `[路路当前状态]
心情: ${result.moodText}
${result.moodInstruction}
${statusSummary ? `最近系统状态: ${statusSummary}` : ""}`.trim();
}
//# sourceMappingURL=mood.js.map