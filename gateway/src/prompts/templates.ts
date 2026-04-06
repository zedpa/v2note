/**
 * Prompt 模板 — v2 简化版
 * 精简到 <500 字符，聚焦数据呈现，移除风格规则/视角轮换
 */

export const MORNING_PROMPT = `根据待办数据生成晨间问候。返回纯 JSON，不要 markdown 包裹。

<pending_todos>{pendingTodos}</pending_todos>
<yesterday_stats>{yesterdayStats}</yesterday_stats>

{
  "greeting": "≤15字，自然口语问候，包含日期",
  "today_focus": ["待办原文，按时间排序，最多5条。无待办时写一句引导语"],
  "carry_over": ["逾期待办，语气轻松"],
  "stats": {"yesterday_done": 数字, "yesterday_total": 数字}
}
空类别返回空数组。`;

export const EVENING_PROMPT = `根据数据生成晚间总结。返回纯 JSON，不要 markdown 包裹。

<today_done>{todayDone}</today_done>
<today_pending>{todayPending}</today_pending>
今日记录: {newRecordCount} 条

{
  "headline": "≤25字，一句话总结今天",
  "accomplishments": ["完成的事，具体到事项名"],
  "tomorrow_preview": ["明日排期/待处理，最多3条"],
  "stats": {"done": 数字, "new_records": 数字}
}
完成为空时 accomplishments 返回空数组。无明日安排时 tomorrow_preview 返回空数组。`;
