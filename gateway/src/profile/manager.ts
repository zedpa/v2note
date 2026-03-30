import { chatCompletion } from "../ai/provider.js";
import { userProfileRepo } from "../db/repositories/index.js";

export interface UserProfile {
  device_id: string;
  content: string;
  updated_at: string;
}

/**
 * Load the user profile for a device.
 */
export async function loadProfile(deviceId: string, userId?: string): Promise<UserProfile | null> {
  if (userId) {
    const byUser = await userProfileRepo.findByUser(userId);
    if (byUser) return byUser;
  }
  return userProfileRepo.findByDevice(deviceId);
}

// ── Per-user write queue for serialized updates ──
const updateQueues = new Map<string, Promise<void>>();

/**
 * Update the user profile based on new interactions.
 * Serialized per-user to prevent concurrent overwrites.
 */
export async function updateProfile(
  deviceId: string,
  newInteraction: string,
  userId?: string,
): Promise<void> {
  const key = userId ?? deviceId;
  const prev = updateQueues.get(key) ?? Promise.resolve();
  const next = prev.then(() => doUpdateProfile(deviceId, newInteraction, userId)).catch(() => {});
  updateQueues.set(key, next);
  return next;
}

async function doUpdateProfile(
  deviceId: string,
  newInteraction: string,
  userId?: string,
): Promise<void> {
  const existing = userId
    ? await userProfileRepo.findByUser(userId) ?? await loadProfile(deviceId)
    : await loadProfile(deviceId);
  const currentProfile = existing?.content ?? "";

  const result = await chatCompletion(
    [
      {
        role: "system",
        content: `你负责维护用户画像。基于现有画像和新互动，提取并更新用户的事实信息。

## 用户画像应包含的内容：
- 用户的职业、身份、角色
- 用户的习惯和日常规律（作息、工作模式）
- 用户提到的重要人物关系（同事、家人）
- 用户的兴趣、技能、知识领域
- 用户的常去地点、生活环境
- 用户反复提及的偏好和倾向

## 用户画像不应包含的内容（这些属于 AI 人格）：
- 用户对 AI 的期望和设定
- AI 的语气、风格偏好

用 markdown 格式，分类清晰。只输出更新后的完整用户画像。
如果新互动没有用户个人信息，返回原画像不变。
保持简洁，避免冗余。`,
      },
      {
        role: "user",
        content: `## 现有用户画像\n${currentProfile || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
      },
    ],
    { temperature: 0.3, tier: "background" },
  );

  if (userId) {
    await userProfileRepo.upsertByUser(userId, result.content);
  } else {
    await userProfileRepo.upsert(deviceId, result.content);
  }
}
