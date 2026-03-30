/**
 * Onboarding handler — 处理冷启动 5 问的每步回答。
 *
 * Q1: 称呼 → UserProfile.name
 * Q2: 生活阶段 → 日记 + Digest
 * Q3: 当前焦点 → 日记 + Digest
 * Q4: 痛点 → UserProfile.pain_points + 日记 + Digest
 * Q5: 习惯 → onboarding_done + 日记 + Digest
 */

import { recordRepo, transcriptRepo, userProfileRepo, todoRepo } from "../db/repositories/index.js";
import { digestRecords } from "./digest.js";
import { appendToDiary } from "../diary/manager.js";

/** 预设维度关键词（覆盖 9 个核心维度，与 time-estimator domain CHECK 一致） */
const DOMAIN_KEYWORDS: Array<{ domain: string; keywords: string[] }> = [
  { domain: "工作", keywords: ["上班", "工作", "公司", "项目", "领导", "同事", "会议", "加班", "出差", "业务"] },
  { domain: "学习", keywords: ["学习", "上学", "考试", "读书", "课程", "培训", "技能", "知识"] },
  { domain: "创业", keywords: ["创业", "产品", "创始", "融资", "客户", "市场", "商业", "合伙"] },
  { domain: "投资", keywords: ["投资", "理财", "股票", "基金", "炒币", "房产", "收益", "风险"] },
  { domain: "家庭", keywords: ["家庭", "孩子", "带娃", "父母", "家人", "婚姻", "伴侣"] },
  { domain: "健康", keywords: ["健康", "运动", "锻炼", "减肥", "饮食", "睡眠", "医院"] },
  { domain: "社交", keywords: ["朋友", "社交", "聚会", "人脉", "关系", "沟通"] },
  { domain: "生活", keywords: ["生活", "日常", "购物", "搬家", "租房", "做饭"] },
];

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

  // Q2: 解析维度关键词，创建种子目标（让侧边栏维度不为空）
  if (step === 2) {
    seedDimensionGoals(userId, deviceId, trimmed).catch((e) =>
      console.warn("[onboarding] Dimension seeding failed:", e.message),
    );
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
  console.log(`[onboarding][⏱] Q${step} firing digest for record ${record.id}`);
  digestRecords([record.id], { deviceId, userId }).catch((e) => {
    console.warn("[onboarding] Digest failed:", e.message);
  });

  // Q5: 标记 onboarding 完成
  if (step === 5) {
    await userProfileRepo.upsertOnboardingField(userId, "onboarding_done", "true");
  }

  return { ok: true, recordCreated: true, skipped: false };
}

/**
 * 从 Q2 回答中提取维度关键词，为每个匹配维度创建一个种子目标（level=1）。
 * 保证至少有"生活"维度，使侧边栏在冷启动后不为空。
 */
async function seedDimensionGoals(userId: string, deviceId: string, answer: string): Promise<void> {
  const text = answer.toLowerCase();
  const matched = DOMAIN_KEYWORDS
    .filter((d) => d.keywords.some((k) => text.includes(k)))
    .map((d) => d.domain);

  // 保证至少有"生活"
  if (!matched.includes("生活")) matched.push("生活");

  for (const domain of matched.slice(0, 6)) {
    await todoRepo.createGoalAsTodo({
      user_id: userId,
      device_id: deviceId,
      text: `${domain}相关目标`,
      level: 1,
      status: "active",
      domain,
    });
  }
  console.log(`[onboarding] Seeded ${matched.length} dimension goals: ${matched.join(", ")}`);
}
