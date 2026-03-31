/**
 * Onboarding handler v2 — AI 驱动的冷启动对话。
 *
 * 核心变化（v1 → v2）：
 * - 不再创建日记 / transcript / digest
 * - 每步调 AI（fast tier）生成回应 + 下一问
 * - 只写 UserProfile 字段
 * - Q5 完成后触发 seedWelcomeDiaries + seedGoals + Profile/Soul 初始化
 */

import { userProfileRepo, todoRepo, strikeRepo } from "../db/repositories/index.js";
import { chatCompletion } from "../ai/provider.js";
import { seedWelcomeDiaries } from "./welcome-seed.js";
import { updateProfile } from "../profile/manager.js";
import { updateSoul } from "../soul/manager.js";
import {
  buildOnboardingSystemPrompt,
  buildOnboardingMessages,
  FALLBACK_QUESTIONS,
} from "./onboarding-prompt.js";

// ── Types ────────────────────────────────────────────────────

interface OnboardingChatInput {
  userId: string;
  deviceId: string;
  step: number;   // 1-5
  answer: string;
  history: Array<{ role: "ai" | "user"; text: string }>;
}

interface ExtractedFields {
  name?: string;
  occupation?: string;
  current_focus?: string;
  pain_points?: string;
  review_time?: string;
  dimensions?: string[];
  seed_goals?: string[];
}

interface OnboardingChatResult {
  reply: string;
  nextStep: number;
  done: boolean;
  extracted: ExtractedFields;
}

// ── 旧接口（兼容，保留给旧前端过渡） ────────────────────────

interface OnboardingInput {
  userId: string;
  deviceId: string;
  step: number;
  answer: string;
}

interface OnboardingResult {
  ok: boolean;
  recordCreated: boolean;
  skipped: boolean;
}

/** @deprecated 使用 handleOnboardingChat 替代 */
export async function handleOnboardingAnswer(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const { userId, deviceId, step, answer } = input;
  const trimmed = answer.trim();

  if (!trimmed) {
    return { ok: true, recordCreated: false, skipped: true };
  }

  // 只存 profile，不创建日记
  if (step === 1) {
    await userProfileRepo.upsertOnboardingField(userId, "name", trimmed, deviceId);
  }
  if (step === 5) {
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);
    try {
      await seedWelcomeDiaries(userId, deviceId);
    } catch (e) {
      console.error("[onboarding] Welcome seed failed:", e);
    }
  }

  return { ok: true, recordCreated: false, skipped: false };
}

// ── 新接口：AI 驱动对话 ─────────────────────────────────────

export async function handleOnboardingChat(
  input: OnboardingChatInput,
): Promise<OnboardingChatResult> {
  const { userId, deviceId, step, answer, history } = input;
  const trimmed = answer.trim();

  // 收集所有提取到的字段
  const extracted: ExtractedFields = {};

  // Q1: 存名字
  if (step === 1 && trimmed) {
    extracted.name = trimmed;
    await userProfileRepo.upsertOnboardingField(userId, "name", trimmed, deviceId);
  }

  // 空回答 = 跳过（AI 生成不含回应的下一问）
  if (!trimmed) {
    const nextStep = Math.min(step + 1, 6);
    const done = nextStep > 5;
    if (done) {
      await finishOnboarding(userId, deviceId, extracted, history);
    }
    const fallback = FALLBACK_QUESTIONS[step] ?? "我们开始吧 ✨";
    return { reply: fallback, nextStep, done, extracted };
  }

  // 调 AI 生成回应
  let reply: string;
  let aiExtracted: ExtractedFields = {};
  let skipTo: number | null = null;

  try {
    const userName = extracted.name ?? getUserNameFromHistory(history) ?? null;
    const systemPrompt = buildOnboardingSystemPrompt(step, userName);
    const messages = buildOnboardingMessages(systemPrompt, history, trimmed);

    const aiResult = await chatCompletion(messages, {
      tier: "fast",
      json: true,
      temperature: 0.7,
      timeout: 8000,
    });

    const parsed = parseAIResponse(aiResult.content);
    reply = parsed.reply;
    aiExtracted = parsed.extracted_fields;
    skipTo = parsed.skip_to;

    console.log(`[onboarding] Q${step} AI reply: ${reply}`);
  } catch (e: any) {
    console.warn(`[onboarding] AI call failed for Q${step}:`, e.message);
    // Fallback 到硬编码
    reply = FALLBACK_QUESTIONS[step] ?? "我们继续吧";
  }

  // 合并 AI 提取的字段
  if (aiExtracted.occupation) extracted.occupation = aiExtracted.occupation;
  if (aiExtracted.current_focus) extracted.current_focus = aiExtracted.current_focus;
  if (aiExtracted.pain_points) extracted.pain_points = aiExtracted.pain_points;
  if (aiExtracted.review_time) extracted.review_time = aiExtracted.review_time;
  if (aiExtracted.dimensions?.length) extracted.dimensions = aiExtracted.dimensions;
  if (aiExtracted.seed_goals?.length) {
    extracted.seed_goals = [
      ...(extracted.seed_goals ?? []),
      ...aiExtracted.seed_goals,
    ];
  }

  // 按 step 存储字段
  await saveExtractedFields(userId, deviceId, step, trimmed, extracted);

  // 计算下一步
  const nextStep = skipTo ?? Math.min(step + 1, 6);
  const done = nextStep > 5 || step >= 5;

  // 完成 onboarding
  if (done) {
    await finishOnboarding(userId, deviceId, extracted, history, trimmed);
  }

  return { reply, nextStep: Math.min(nextStep, 6), done, extracted };
}

// ── 内部函数 ─────────────────────────────────────────────────

/** 从历史对话中提取用户名字（Q1 回答） */
function getUserNameFromHistory(
  history: Array<{ role: "ai" | "user"; text: string }>,
): string | null {
  // 第一条 user 消息通常是名字
  const firstUserMsg = history.find((m) => m.role === "user");
  return firstUserMsg?.text?.trim() || null;
}

/** 解析 AI JSON 回应 */
function parseAIResponse(content: string): {
  reply: string;
  extracted_fields: ExtractedFields;
  skip_to: number | null;
} {
  try {
    // 清理可能的 markdown code block
    const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      reply: parsed.reply ?? "",
      extracted_fields: parsed.extracted_fields ?? {},
      skip_to: parsed.skip_to ?? null,
    };
  } catch {
    // JSON 解析失败，把整个内容当作 reply
    return {
      reply: content.trim().slice(0, 100),
      extracted_fields: {},
      skip_to: null,
    };
  }
}

/** 按 step 存储提取的字段到 UserProfile */
async function saveExtractedFields(
  userId: string,
  deviceId: string,
  step: number,
  answer: string,
  extracted: ExtractedFields,
): Promise<void> {
  // ── 1. 存储 profile 字段（失败不阻塞种子创建）──
  try {
    if (step === 2) {
      const occupation = extracted.occupation ?? answer;
      await userProfileRepo.upsertOnboardingField(userId, "occupation", occupation, deviceId);
    }
    if (step === 3) {
      const focus = extracted.current_focus ?? answer;
      await userProfileRepo.upsertOnboardingField(userId, "current_focus", focus, deviceId);
    }
    if (step === 4) {
      const pain = extracted.pain_points ?? answer;
      await userProfileRepo.upsertOnboardingField(userId, "pain_points", pain, deviceId);
    }
    if (step === 5) {
      const time = extracted.review_time ?? answer;
      await userProfileRepo.upsertOnboardingField(userId, "review_time", time, deviceId);
    }
  } catch (e: any) {
    console.warn(`[onboarding] saveExtractedFields Q${step} profile failed:`, e.message);
  }

  // ── 2. 种子目标创建（独立于 profile 存储）──
  if ((step === 2 || step === 3) && extracted.seed_goals?.length) {
    seedGoals(userId, deviceId, extracted.seed_goals, extracted).catch((e) =>
      console.warn(`[onboarding] Goal seeding Q${step} failed:`, e.message),
    );
  }
}

/** 创建种子目标 + 种子 Strike（供后续聚类使用） */
async function seedGoals(
  userId: string,
  deviceId: string,
  seedGoalTitles: string[],
  extracted: ExtractedFields,
): Promise<void> {
  // 收集所有种子目标标题（去重）
  const titles = [...new Set(seedGoalTitles)];

  // 如果 AI 没提取到任何 seed_goals，从 occupation / current_focus 生成 fallback
  if (titles.length === 0) {
    if (extracted.current_focus) titles.push(extracted.current_focus);
    if (extracted.occupation && titles.length === 0) titles.push(extracted.occupation);
  }

  if (titles.length === 0) {
    console.log("[onboarding] No seed goals to create");
    return;
  }

  for (const title of titles.slice(0, 6)) {
    // 创建 level=1 目标
    await todoRepo.createGoalAsTodo({
      user_id: userId,
      device_id: deviceId,
      text: title,
      level: 1,
      status: "active",
    });

    // 创建对应的种子 Strike（为 batch-analyze 提供锚点）
    await strikeRepo.create({
      user_id: userId,
      nucleus: title,
      polarity: "intend",
      is_cluster: false,
      confidence: 0.8,
      salience: 1.0,
      source_type: "onboarding",
    });
  }

  console.log(`[onboarding] Seeded ${titles.length} goals + strikes: ${titles.join(", ")}`);
}

/** Onboarding 完成：标记 done + 欢迎日记 + Profile/Soul 初始化 */
async function finishOnboarding(
  userId: string,
  deviceId: string,
  extracted: ExtractedFields,
  history: Array<{ role: "ai" | "user"; text: string }>,
  lastAnswer?: string,
): Promise<void> {
  // 标记完成
  try {
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true", deviceId);
  } catch (e: any) {
    console.warn("[onboarding] Mark done failed:", e.message);
  }

  // 插入欢迎日记
  try {
    const seedResult = await seedWelcomeDiaries(userId, deviceId);
    console.log(`[onboarding] Welcome seed: created=${seedResult.created}`);
  } catch (e) {
    console.error("[onboarding] Welcome seed failed:", e);
  }

  // 拼接全部对话内容，写入 UserProfile.content + 触发 Profile/Soul 初始化
  const allUserMessages = history
    .filter((m) => m.role === "user")
    .map((m) => m.text);
  if (lastAnswer) allUserMessages.push(lastAnswer);
  const fullConversation = allUserMessages.join("\n");

  if (fullConversation.trim()) {
    // 写入 UserProfile.content
    try {
      await userProfileRepo.upsertByUser(userId, fullConversation);
    } catch {
      // 可能 user 还没有 profile 行（由前面的 upsertOnboardingField 创建）
    }

    // Fire-and-forget: Profile + Soul 初始化
    updateProfile(deviceId, fullConversation, userId).catch((e) =>
      console.warn("[onboarding] Profile init failed:", e.message),
    );
    updateSoul(deviceId, fullConversation, userId).catch((e) =>
      console.warn("[onboarding] Soul init failed:", e.message),
    );
  }

  console.log("[onboarding] ✅ Onboarding completed for user", userId);
}
