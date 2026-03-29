/**
 * self-evolution 测试 — Agent 自适应（交互偏好学习 + Soul 守护）
 *
 * 覆盖 spec 8 个场景：
 * 1. Plan 偏好提取（计数阈值 >= 3）
 * 2. 隐式偏好推断（行为模式分析）
 * 3. 偏好注入 prompt 格式
 * 4. Soul 守护（严格门控）
 * 5. Profile 被动学习（持久/临时区分）
 * 6. 偏好衰减（60天 stale, 90天删除）
 * 7. unmet_request 聚合
 * 8. 用户偏好可见性
 */
export {};
