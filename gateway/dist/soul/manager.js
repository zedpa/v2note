import { chatCompletion } from "../ai/provider.js";
import { soulRepo } from "../db/repositories/index.js";
/**
 * Load the Soul (user profile) for a device.
 */
export async function loadSoul(deviceId) {
    return soulRepo.findByDevice(deviceId);
}
/**
 * Update the Soul based on new interactions.
 * The AI merges the existing soul with insights from the new interaction.
 */
export async function updateSoul(deviceId, newInteraction) {
    const existing = await loadSoul(deviceId);
    const currentSoul = existing?.content ?? "";
    const result = await chatCompletion([
        {
            role: "system",
            content: `你负责维护用户画像（Soul）。基于现有画像和新的互动内容，生成更新后的用户画像。
用户画像应包含：性格特点、工作领域、关注重点、沟通偏好、重要关系等。
用 markdown 格式，简洁但全面。只输出更新后的完整画像，不要解释。
如果新互动没有提供有价值的信息，返回原画像不变。`,
        },
        {
            role: "user",
            content: `## 现有画像\n${currentSoul || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
        },
    ], { temperature: 0.3 });
    await soulRepo.upsert(deviceId, result.content);
}
//# sourceMappingURL=manager.js.map