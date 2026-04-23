/**
 * Prompt 模板 — v2 简化版
 * 精简到 <500 字符，聚焦数据呈现，移除风格规则/视角轮换
 */

export const MORNING_PROMPT = `根据用户画像生成个性化晨间问候。返回纯 JSON，不要 markdown 包裹。

<user_soul>{soul}</user_soul>
<user_profile>{profile}</user_profile>
<pending_todos>{pendingTodos}</pending_todos>
<yesterday_stats>{yesterdayStats}</yesterday_stats>

{
  "greeting": "≤30字，基于用户画像的个性化问候，包含日期，语气自然温暖。不要提待办数量。",
  "today_focus": ["待办原文，按时间排序，最多5条。无待办时写一句引导语"],
  "carry_over": ["逾期待办，语气轻松"],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字}
}
空类别返回空数组。`;

// EVENING_PROMPT 已移除 — 晚报统一走 daily-loop.ts generateEveningSummary 内联 prompt
