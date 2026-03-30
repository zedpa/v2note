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
        content: `你负责维护用户定义的 AI 身份（Identity）。基于现有身份定义和用户的新互动，更新 AI 身份。

## Identity 应该包含的内容：
- AI 的名字（如用户给 AI 取了名字）
- 性格特征（如"直接""温暖""幽默"）
- 互动方式偏好（追问式/直接告知/根据情况判断）
- 专注领域（用户希望 AI 重点关注的方面）
- 禁忌（用户不希望 AI 做的事）
- 沟通风格偏好（语气、简洁度、是否用 emoji 等）

## Identity 不应该包含：
- 用户的个人信息（职业、习惯、人际关系 → 这些属于用户画像）
- 具体事件、日程

用 markdown 格式，按上述分类组织。只输出更新后的完整 AI 身份定义。
如果新互动没有对 AI 身份的要求，返回原定义不变。`,
      },
      {
        role: "user",
        content: `## 现有 AI 身份定义\n${currentSoul || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
      },
    ],
    { temperature: 0.3, tier: "background" },
  );

  if (userId) {
    await soulRepo.upsertByUser(userId, result.content);
  } else {
    await soulRepo.upsert(deviceId, result.content);
  }
}
