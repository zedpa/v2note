import { chatCompletion } from "../ai/provider.js";
import { soulRepo } from "../db/repositories/index.js";

export interface Soul {
  device_id: string;
  content: string;
  updated_at: string;
}

/**
 * Load the Soul (AI identity definition) for a device.
 */
export async function loadSoul(deviceId: string, userId?: string): Promise<Soul | null> {
  if (userId) {
    const byUser = await soulRepo.findByUser(userId);
    if (byUser) return byUser;
  }
  return soulRepo.findByDevice(deviceId);
}

// ── Per-user write queue for serialized updates ──
const updateQueues = new Map<string, Promise<void>>();

/**
 * Update the Soul (AI identity definition) based on new interactions.
 * Serialized per-user to prevent concurrent overwrites.
 */
export async function updateSoul(
  deviceId: string,
  newInteraction: string,
  userId?: string,
): Promise<void> {
  const key = userId ?? deviceId;
  const prev = updateQueues.get(key) ?? Promise.resolve();
  const next = prev.then(() => doUpdateSoul(deviceId, newInteraction, userId)).catch(() => {});
  updateQueues.set(key, next);
  return next;
}

async function doUpdateSoul(
  deviceId: string,
  newInteraction: string,
  userId?: string,
): Promise<void> {
  const existing = userId
    ? await soulRepo.findByUser(userId) ?? await loadSoul(deviceId)
    : await loadSoul(deviceId);
  const currentSoul = existing?.content ?? "";

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你负责维护用户定义的 AI 身份（Identity）。基于现有身份定义和用户的新互动，判断用户是否在**直接对 AI 提出要求或定义**，如果是则更新 AI 身份。

## 关键判断规则
用户的话分两类：
1. **对 AI 的指令**："你以后简洁点""你叫路路""不要那么客气" → 更新 AI Identity
2. **用户在说自己或别人**："我是工程师""你是不是该去看医生""他不要加班" → **不更新**，返回原定义不变

只有明确针对 AI 的指令才更新。用户在叙述、记录、自言自语时提到的"你"通常指别人，不是 AI。

## Identity 应该包含的内容：
- AI 的名字（仅限用户明确说"你叫XX""以后叫你XX"时才提取）
- 性格特征（如"直接""温暖""幽默"）
- 互动方式偏好（追问式/直接告知/根据情况判断）
- 专注领域（用户希望 AI 重点关注的方面）
- 禁忌（用户不希望 AI 做的事）
- 沟通风格偏好（语气、简洁度、是否用 emoji 等）

## Identity 绝对不应该包含：
- 用户自己的名字、职业、习惯、人际关系（这些属于用户画像，不是 AI 身份）
- 具体事件、日程
- 用户在叙述中提到的他人信息

用 markdown 格式，按上述分类组织。只输出更新后的完整 AI 身份定义。
如果新互动没有对 AI 身份的明确要求，返回原定义不变。`,
      },
      {
        role: "user",
        content: `## 现有 AI 身份定义\n${currentSoul || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
      },
    ],
    { temperature: 0.3, tier: "background" },
  );

  if (userId) {
    await soulRepo.upsertByUser(userId, result.content, deviceId);
  } else {
    await soulRepo.upsert(deviceId, result.content);
  }
}
