/**
 * Onboarding handler v4 — 单步完成：存名字 + 标记 onboarding_done。
 *
 * 不再调用 processEntry / 创建 record / transcript。
 * 前端完成 onboarding 后直接进入主界面并触发 Coach Mark 引导。
 */

import { userProfileRepo } from "../db/repositories/index.js";

// ── Types ────────────────────────────────────────────────────

interface OnboardingChatInput {
  userId: string;
  deviceId: string; // 已弃用，保留兼容
  step: number;   // 1 或 2（兼容旧前端）
  answer: string;
}

interface OnboardingResult {
  step: number;
  done: true;
  name: string;
}

export type OnboardingChatResult = OnboardingResult;

// ── 主接口 ──────────────────────────────────────────────────

export async function handleOnboardingChat(
  input: OnboardingChatInput,
): Promise<OnboardingChatResult> {
  const { userId, deviceId, step, answer } = input;
  const trimmed = answer.trim();
  const name = trimmed || "用户";

  // Step 1: 存名字 + 标记完成（一次搞定）
  if (step === 1) {
    await userProfileRepo.upsertOnboardingField(userId, "name", name, deviceId);
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);
    console.log(`[onboarding] Completed: name="${name}" for user ${userId}`);
    return { step: 1, done: true, name };
  }

  // Step 2: 兼容旧前端 / 跳过场景 — 只标记完成
  await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);
  console.log("[onboarding] Completed (step 2 compat)");
  return { step: 2, done: true, name: "用户" };
}
