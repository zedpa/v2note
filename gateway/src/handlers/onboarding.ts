/**
 * Onboarding handler v3 — 极简两步引导。
 *
 * Step 1: 输入名字 → 存 UserProfile.name
 * Step 2: 输入一句话 → 调用 process pipeline → 返回 AI 拆解结果
 *
 * 不再创建欢迎日记 / seed goals / seed strikes。
 * 不再收集 occupation / current_focus / pain_points / review_time。
 */

import { userProfileRepo, recordRepo, transcriptRepo } from "../db/repositories/index.js";
import { processEntry, type ProcessResult } from "./process.js";

// ── Types ────────────────────────────────────────────────────

interface OnboardingChatInput {
  userId: string;
  deviceId: string;
  step: number;   // 1-2
  answer: string;
}

interface OnboardingStep1Result {
  step: 1;
  done: false;
  name: string;
}

interface OnboardingStep2Result {
  step: 2;
  done: true;
  summary?: string;
  todos?: string[];
  tags?: string[];
  recordId?: string;
}

export type OnboardingChatResult = OnboardingStep1Result | OnboardingStep2Result;

// ── 主接口 ──────────────────────────────────────────────────

export async function handleOnboardingChat(
  input: OnboardingChatInput,
): Promise<OnboardingChatResult> {
  const { userId, deviceId, step, answer } = input;
  const trimmed = answer.trim();

  // ── Step 1: 存名字 ──
  if (step === 1) {
    const name = trimmed || "用户";
    await userProfileRepo.upsertOnboardingField(userId, "name", name, deviceId);
    console.log(`[onboarding] Step 1: saved name="${name}" for user ${userId}`);
    return { step: 1, done: false, name };
  }

  // ── Step 2: 调用 process pipeline，返回 AI 拆解结果 ──
  if (step === 2) {
    // 标记 onboarding 完成
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);

    if (!trimmed) {
      console.log("[onboarding] Step 2: empty input, skipping process");
      return { step: 2, done: true };
    }

    try {
      // 创建 record + transcript
      const record = await recordRepo.create({
        device_id: deviceId,
        user_id: userId,
        status: "processing",
        source: "manual",
      });
      await transcriptRepo.create({ record_id: record.id, text: trimmed, language: "zh" });

      // 同步调用 process pipeline
      const processResult: ProcessResult = await processEntry({
        text: trimmed,
        deviceId,
        userId,
        recordId: record.id,
        sourceContext: "timeline",
      });

      console.log(`[onboarding] Step 2: processed record ${record.id}`);

      return {
        step: 2,
        done: true,
        summary: processResult.summary ?? trimmed,
        todos: processResult.todos ?? [],
        tags: processResult.tags ?? [],
        recordId: record.id,
      };
    } catch (e: any) {
      console.error("[onboarding] Step 2 process failed:", e.message);
      // 即使处理失败也标记完成
      return { step: 2, done: true };
    }
  }

  // 非法 step
  await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);
  return { step: 2, done: true };
}
