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

export const EVENING_PROMPT = `根据用户画像生成个性化晚间回顾。返回纯 JSON，不要 markdown 包裹。

<user_soul>{soul}</user_soul>
<user_profile>{profile}</user_profile>
<today_done>{todayDone}</today_done>
<today_pending>{todayPending}</today_pending>
今日记录: {newRecordCount} 条

{
  "headline": "≤30字，基于用户画像的温暖晚间回顾，语气俏皮自然。做了很多→跟他一起开心；什么都没做→'今天就这样了'比'无事项完成'真诚一万倍。",
  "accomplishments": ["完成的事，具体到事项名"],
  "tomorrow_preview": ["明日排期/待处理，最多3条"],
  "stats": {"done": 数字, "new_records": 数字}
}
完成为空时 accomplishments 返回空数组。无明日安排时 tomorrow_preview 返回空数组。`;
