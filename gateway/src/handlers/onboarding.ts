/**
 * Onboarding handler — 处理冷启动 5 问的每步回答。
 *
 * Q1: 称呼 → UserProfile.name
 * Q2: 生活阶段 → 日记 + Digest
 * Q3: 当前焦点 → 日记 + Digest
 * Q4: 痛点 → UserProfile.pain_points + 日记 + Digest
 * Q5: 习惯 → onboarding_done + 日记 + Digest
 */

import { recordRepo, transcriptRepo, userProfileRepo } from "../db/repositories/index.js";
import { digestRecords } from "./digest.js";
import { appendToDiary } from "../diary/manager.js";

const QUESTIONS = [
  "", // 0-indexed padding
  "你好！我是路路 🦌 怎么称呼你？",
  "你现在主要在做什么？上学、工作、创业、带娃…随便说说。",
  "最近最让你花心思的一件事是什么？",
  "你有没有觉得很多想法想过就忘了，或者决定了的事总是拖着没做？",
  "你一般什么时候有空整理想法？早上？睡前？",
];

interface OnboardingInput {
  userId: string;
  deviceId: string;
  step: number; // 1-5
  answer: string;
}

interface OnboardingResult {
  ok: boolean;
  recordCreated: boolean;
  skipped: boolean;
}

export async function handleOnboardingAnswer(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const { userId, deviceId, step, answer } = input;
  const trimmed = answer.trim();

  // 空回答 = 跳过
  if (!trimmed) {
    return { ok: true, recordCreated: false, skipped: true };
  }

  // Q1: 只存名字，不创建日记
  if (step === 1) {
    await userProfileRepo.upsertOnboardingField(userId, "name", trimmed);
    return { ok: true, recordCreated: false, skipped: false };
  }

  // Q4: 额外存 pain_points
  if (step === 4) {
    await userProfileRepo.upsertOnboardingField(userId, "pain_points", trimmed);
  }

  // Q2-Q5: 创建日记 + 触发 Digest
  const questionText = QUESTIONS[step] ?? "";
  const fullText = `${questionText}\n${trimmed}`;

  const record = await recordRepo.create({
    device_id: deviceId,
    user_id: userId,
    status: "completed",
    source: "text",
    source_type: "think",
  });

  // 写入 transcript
  await transcriptRepo.create({
    record_id: record.id,
    text: fullText,
  });

  // 追加到默认日记
  appendToDiary(deviceId, "default", fullText, userId).catch(() => {});

  // 立即触发 Digest（冷启动期不等 batch）
  digestRecords([record.id], { deviceId, userId }).catch((e) => {
    console.warn("[onboarding] Digest failed:", e.message);
  });

  // Q5: 标记 onboarding 完成
  if (step === 5) {
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true");
  }

  return { ok: true, recordCreated: true, skipped: false };
}
