/**
 * 用户反馈路由 — 接收反馈 → AI 分诊 → 创建 GitHub Issue
 */

import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { triageReport, checkDuplicate, registerCreatedIssue, type TriageInput } from "../handlers/triage.js";
import { createGitHubIssue, addIssueComment } from "../lib/github.js";
import { captureException } from "../lib/sentry.js";

export function registerFeedbackRoutes(router: Router) {
  /**
   * POST /api/v1/feedback — 提交用户反馈
   * Body: { description, category?, platform?, screenshot?, logs? }
   */
  router.post("/api/v1/feedback", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) { sendError(res, "Unauthorized", 401); return; }

    const body = await readBody(req);
    const { description, category, platform, screenshot, logs } = body;

    if (!description || typeof description !== "string" || description.trim().length < 5) {
      sendError(res, "请输入至少 5 个字的描述", 400);
      return;
    }

    try {
      // 1. AI 分诊
      const triageInput: TriageInput = {
        source: "in-app",
        rawContent: description,
        platform: platform ?? "unknown",
        screenshot: screenshot ?? undefined,
        stackTrace: logs ?? undefined,
      };

      const triage = await triageReport(triageInput);

      // 2. 去重检查
      const dupCheck = await checkDuplicate(triage.title);

      if (dupCheck.isDuplicate && dupCheck.similarIssue) {
        // 疑似重复 → 在已有 Issue 上追加评论
        await addIssueComment(
          dupCheck.similarIssue,
          `**用户反馈（疑似重复）**\n\n来源: ${triageInput.source} | 平台: ${triageInput.platform}\n\n> ${description}\n\n_自动标记为疑似重复_`,
        );
        sendJson(res, {
          status: "duplicate",
          message: "感谢反馈！我们已在跟踪此问题",
          issueNumber: dupCheck.similarIssue,
        });
        return;
      }

      // 3. 创建 GitHub Issue
      const issueBody = buildIssueBody(triage, triageInput, userId);
      const issue = await createGitHubIssue({
        title: triage.title,
        body: issueBody,
        labels: triage.labels,
      });

      if (issue) {
        registerCreatedIssue(triage.title, issue.number);
      }

      sendJson(res, {
        status: "created",
        message: "感谢反馈！我们会尽快处理",
        issueNumber: issue?.number ?? null,
        severity: triage.severity,
      });
    } catch (err: any) {
      console.error("[feedback] Failed to process feedback:", err.message);
      captureException(err, { feedbackDescription: description.slice(0, 200) });
      // 即使分诊失败也给用户积极回复
      sendJson(res, {
        status: "received",
        message: "感谢反馈！我们已收到并会处理",
      });
    }
  });

  /**
   * POST /api/v1/webhooks/sentry — Sentry Webhook 接收端
   * Sentry Alert → 自动创建 GitHub Issue
   */
  router.post("/api/v1/webhooks/sentry", async (req, res) => {
    const body = await readBody(req);

    // Sentry webhook 验证（简单 token 校验）
    const webhookToken = process.env.SENTRY_WEBHOOK_TOKEN;
    if (webhookToken) {
      const authHeader = req.headers["sentry-hook-signature"] as string | undefined;
      // 简化校验：如果配置了 token 但请求未携带则拒绝
      if (!authHeader) {
        sendError(res, "Unauthorized", 401);
        return;
      }
    }

    try {
      const { action, data } = body;

      // 只处理 triggered 类型的告警
      if (action !== "triggered" || !data?.issue) {
        sendJson(res, { status: "ignored" });
        return;
      }

      const issue = data.issue;
      const triageInput: TriageInput = {
        source: "sentry",
        rawContent: `Sentry Error: ${issue.title}\n\nCulprit: ${issue.culprit ?? "unknown"}\nFirst seen: ${issue.firstSeen}\nCount: ${issue.count}`,
        stackTrace: issue.metadata?.value ?? undefined,
      };

      const triage = await triageReport(triageInput);

      // 去重
      const dupCheck = await checkDuplicate(triage.title);
      if (dupCheck.isDuplicate && dupCheck.similarIssue) {
        await addIssueComment(
          dupCheck.similarIssue,
          `**Sentry 告警（疑似重复）**\n\nError: ${issue.title}\nCount: ${issue.count}\n\n_自动标记为疑似重复_`,
        );
        sendJson(res, { status: "duplicate", issueNumber: dupCheck.similarIssue });
        return;
      }

      const issueBody = `## Sentry 自动告警\n\n**Error:** ${issue.title}\n**Culprit:** ${issue.culprit ?? "unknown"}\n**Count:** ${issue.count}\n**First Seen:** ${issue.firstSeen}\n\n---\n\n${triage.body}\n\n---\n_来源: Sentry Webhook | 自动分诊_`;

      const ghIssue = await createGitHubIssue({
        title: triage.title,
        body: issueBody,
        labels: [...triage.labels, "sentry"],
      });

      if (ghIssue) {
        registerCreatedIssue(triage.title, ghIssue.number);
      }

      sendJson(res, { status: "created", issueNumber: ghIssue?.number ?? null });
    } catch (err: any) {
      console.error("[sentry-webhook] Failed to process:", err.message);
      captureException(err);
      sendJson(res, { status: "error", message: err.message }, 500);
    }
  });
}

function buildIssueBody(
  triage: { body: string; severity: string; domain: string },
  input: TriageInput,
  userId: string,
): string {
  const parts: string[] = [];

  parts.push(triage.body);
  parts.push("\n---\n");
  parts.push("### 元信息");
  parts.push(`- **来源**: ${input.source}`);
  parts.push(`- **平台**: ${input.platform ?? "unknown"}`);
  parts.push(`- **严重度**: ${triage.severity}`);
  parts.push(`- **模块域**: ${triage.domain}`);
  parts.push(`- **用户 ID**: \`${userId.slice(0, 8)}...\``);

  if (input.screenshot) {
    parts.push(`\n### 截图\n![screenshot](${input.screenshot})`);
  }

  if (input.stackTrace) {
    parts.push(`\n### 日志\n<details>\n<summary>展开查看</summary>\n\n\`\`\`\n${input.stackTrace.slice(0, 3000)}\n\`\`\`\n</details>`);
  }

  parts.push("\n---\n_自动创建 by V2Note Triage Agent_");

  return parts.join("\n");
}
