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
export async function loadSoul(deviceId: string): Promise<Soul | null> {
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
        content: `你负责维护 AI 助手的人格定义（Soul）。基于现有定义和用户的新互动，更新 AI 的人格。

## Soul 应该包含的内容（仅限 AI 人格相关）：
- 用户对 AI 的期望和设定（如"你要像一个严格的教练"）
- AI 行为偏好（语气、风格、禁忌话题）
- 交互模式偏好（简洁/详细、主动/被动）
- AI 专注领域

## Soul 不应该包含的内容（这些属于用户画像，不在此处记录）：
- 用户的职业、身份、习惯
- 用户的日程安排、作息时间
- 用户提到的具体事件、人名、地点
- 用户的个人目标、偏好

用 markdown 格式，简洁但全面。只输出更新后的完整 AI 人格定义。
如果新互动没有对 AI 行为的要求，返回原定义不变。`,
      },
      {
        role: "user",
        content: `## 现有 AI 人格定义\n${currentSoul || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
      },
    ],
    { temperature: 0.3 },
  );

  if (userId) {
    await soulRepo.upsertByUser(userId, result.content);
  } else {
    await soulRepo.upsert(deviceId, result.content);
  }
}
