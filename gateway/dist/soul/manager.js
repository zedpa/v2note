import { chatCompletion } from "../ai/provider.js";
import { soulRepo } from "../db/repositories/index.js";
/**
 * Load the Soul (AI identity definition) for a device.
 */
export async function loadSoul(deviceId) {
    return soulRepo.findByDevice(deviceId);
}
/**
 * Update the Soul (AI identity definition) based on new interactions.
 * The AI merges the existing soul with insights from the new interaction.
 */
export async function updateSoul(deviceId, newInteraction) {
    const existing = await loadSoul(deviceId);
    const currentSoul = existing?.content ?? "";
    const result = await chatCompletion([
        {
            role: "system",
            content: `你负责维护 AI 助手的身份定义（Soul）。基于现有的 AI 身份定义和用户的新互动，更新 AI 的身份。
AI 身份应包含：用户对 AI 的要求和期望、AI 的行为准则、交互风格偏好、专注领域等。
用 markdown 格式，简洁但全面。只输出更新后的完整 AI 身份定义。
如果新互动没有对 AI 行为的要求，返回原定义不变。`,
        },
        {
            role: "user",
            content: `## 现有 AI 身份定义\n${currentSoul || "（空白，第一次互动）"}\n\n## 新互动内容\n${newInteraction}`,
        },
    ], { temperature: 0.3 });
    await soulRepo.upsert(deviceId, result.content);
}
//# sourceMappingURL=manager.js.map