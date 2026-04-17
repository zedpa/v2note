/**
 * Triage Agent — AI 自动分诊
 * 将原始反馈/错误报告分类为结构化 GitHub Issue
 */

import { z } from "zod";
import { generateStructured, type ChatMessage } from "../ai/provider.js";
import { getEmbedding, cosineSimilarity } from "../memory/embeddings.js";

// ── Schema ──

export const TriageResultSchema = z.object({
  title: z.string().describe("Issue 标题，简洁明确，中文"),
  severity: z.enum(["P0", "P1", "P2", "P3"]).describe("严重程度: P0=服务宕机/数据丢失, P1=核心功能异常, P2=有缺陷可绕过, P3=小问题/美化"),
  domain: z.string().describe("影响的模块域: voice/todo/chat/goal/wiki/ui/auth/infra/cognitive/report/onboarding/other"),
  labels: z.array(z.string()).describe("GitHub Issue 标签，如 ['bug', 'P1', 'voice']"),
  body: z.string().describe("Issue 正文，Markdown 格式，包含: 问题描述、复现步骤（如有）、影响范围"),
  isDuplicate: z.boolean().describe("是否疑似重复"),
  duplicateReason: z.string().optional().describe("如果疑似重复，说明与哪个问题相似"),
});

export type TriageResult = z.infer<typeof TriageResultSchema>;

// ── 已知模块域列表（从 specs/INDEX.md 提取） ──

const KNOWN_DOMAINS = [
  "voice — 录音、语音识别、语音路由",
  "todo — 待办、任务管理、日历",
  "chat — 对话、AI 聊天、工具调用",
  "goal — 目标、愿望、规划",
  "wiki — 知识库、Wiki 页面、认知引擎",
  "ui — 界面、交互、设计、移动端视图",
  "auth — 登录、注册、认证、JWT",
  "infra — 部署、数据库、性能、监控",
  "cognitive — 认知引擎、聚类、摘要、记忆",
  "report — 日报、简报、回顾、晚间总结",
  "onboarding — 新用户引导、初始化",
  "ingest — 内容导入、URL 抓取、文件上传",
  "notification — 通知、提醒、推送",
  "other — 不属于以上任何域",
];

// ── 已知陷阱摘要（帮助 AI 识别常见错误模式）──

const KNOWN_PITFALLS = `
常见错误模式（如果报告匹配这些模式请在 body 中标注）：
- 时区问题：日期显示错误、0:00-8:00 之间日期偏移（UTC/本地时区混淆）
- 数据库锁泄漏：操作卡住、并发操作超时（advisory lock 在 transaction pooler 上）
- AI 幻觉：无效的 UUID 引用、不存在的数据关联
- 删除残留：某功能删除后其他页面报错（SQL 引用未清理）
- 身份链路断裂：401 错误、认证失败（deviceId/userId 迁移遗漏）
`;

// ── Triage 主函数 ──

export interface TriageInput {
  source: "sentry" | "in-app" | "manual";
  rawContent: string;
  platform?: string;
  userAgent?: string;
  screenshot?: string;
  stackTrace?: string;
}

/**
 * 对原始报告进行 AI 分诊
 * @returns 结构化的 Issue 数据
 */
export async function triageReport(input: TriageInput): Promise<TriageResult> {
  const systemPrompt = `你是 V2Note (念念有路) 产品的自动 Bug 分诊员。
你的任务是将用户反馈或错误报告转换为结构化的 GitHub Issue。

## 模块域列表
${KNOWN_DOMAINS.map((d) => `- ${d}`).join("\n")}

${KNOWN_PITFALLS}

## 严重度定义
- P0: 服务完全不可用、数据丢失、安全漏洞
- P1: 核心功能（录音、待办、对话）异常，影响主要用户流程
- P2: 功能有缺陷但用户可以绕过，或非核心功能异常
- P3: UI 美化、文案优化、非功能性改进

## 输出要求
- title: 简洁，格式 "[域] 问题描述"，如 "[voice] 录音完成后时间线不显示记录"
- body: Markdown 格式，包含「问题描述」「复现条件」「影响范围」三段
- labels: 至少包含 bug 或 enhancement，加上严重度和域标签
- 如果描述模糊不足以判断，severity 默认 P2，并在 body 中注明需要更多信息`;

  const userContent = buildUserMessage(input);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];

  const { object } = await generateStructured(messages, TriageResultSchema, {
    tier: "fast",
    temperature: 0.2,
    schemaName: "TriageResult",
    schemaDescription: "Bug triage classification result",
  });

  return object;
}

function buildUserMessage(input: TriageInput): string {
  const parts: string[] = [];

  parts.push(`## 来源: ${input.source}`);
  if (input.platform) parts.push(`## 平台: ${input.platform}`);

  parts.push(`\n## 原始内容\n${input.rawContent}`);

  if (input.stackTrace) {
    parts.push(`\n## 堆栈跟踪\n\`\`\`\n${input.stackTrace.slice(0, 2000)}\n\`\`\``);
  }

  if (input.screenshot) {
    parts.push(`\n## 截图\n![screenshot](${input.screenshot})`);
  }

  return parts.join("\n");
}

// ── 去重检测（基于嵌入向量相似度） ──

interface RecentIssue {
  title: string;
  number: number;
  embedding?: number[];
}

// 内存缓存最近的 Issue 嵌入（简单实现，重启后清空）
const recentIssueCache: RecentIssue[] = [];
const MAX_CACHE_SIZE = 100;
const DUPLICATE_THRESHOLD = 0.85;

/**
 * 检查新 Issue 是否与最近的 Issue 重复
 * @returns 重复的 Issue number，或 null
 */
export async function checkDuplicate(title: string): Promise<{ isDuplicate: boolean; similarIssue?: number }> {
  try {
    const embedding = await getEmbedding(title);

    for (const cached of recentIssueCache) {
      if (!cached.embedding) continue;
      const similarity = cosineSimilarity(embedding, cached.embedding);
      if (similarity > DUPLICATE_THRESHOLD) {
        return { isDuplicate: true, similarIssue: cached.number };
      }
    }

    // 缓存当前 Issue 的嵌入
    if (recentIssueCache.length >= MAX_CACHE_SIZE) {
      recentIssueCache.shift();
    }
    recentIssueCache.push({ title, number: 0, embedding });

    return { isDuplicate: false };
  } catch {
    // 嵌入服务不可用时跳过去重
    return { isDuplicate: false };
  }
}

/**
 * 注册已创建的 Issue（更新缓存中的 number）
 */
export function registerCreatedIssue(title: string, number: number): void {
  const cached = recentIssueCache.find((i) => i.title === title);
  if (cached) {
    cached.number = number;
  }
}
