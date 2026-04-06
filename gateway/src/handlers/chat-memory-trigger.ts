/**
 * 即时记忆触发：关键词快筛
 * spec: chat-persistence.md 场景 5.1-5.2
 *
 * 快筛只是门槛过滤，命中后由 Mem0 AI 判断是否真正值得存储。
 */

/** 预编译的记忆触发正则 — O(1) 匹配 */
export const MEMORY_TRIGGER_REGEX =
  /记住|记下来|记好了|别忘了|给我记着|以后都|以后每次|从现在起|从今以后|永远不要|再也不要|别再给我|每次都要|一直这样|所有时候都|必须|一定要|绝对不能|不许|不准|说了多少次了|跟你说过|我不是说了吗|又这样|怎么又|还是这样|不是这样的|我要的不是|你怎么每次都|我喜欢|我不喜欢|我习惯|我讨厌|我的风格是|我一般都|对我来说/;

/** 检测消息是否命中记忆触发关键词 */
export function shouldTriggerMemory(text: string): boolean {
  return MEMORY_TRIGGER_REGEX.test(text);
}
