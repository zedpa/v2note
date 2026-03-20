import type { Router } from "../router.js";
import { sendJson, sendError, getUserId, readBody } from "../lib/http-helpers.js";
import { computeActionPanel } from "../cognitive/action-panel.js";
import { recordSwipe } from "../cognitive/swipe-tracker.js";
import { gatherDecisionContext, buildDecisionPrompt } from "../cognitive/decision.js";
import { chatCompletion } from "../ai/provider.js";

export function registerActionPanelRoutes(router: Router) {
  router.get("/api/v1/action-panel", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    const panel = await computeActionPanel(userId);
    sendJson(res, panel);
  });

  router.post("/api/v1/action-panel/swipe", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    const { strikeId, direction, reason } = await readBody<{
      strikeId: string;
      direction: "left" | "right";
      reason?: "later" | "wait" | "blocked" | "rethink";
    }>(req);
    await recordSwipe({ userId, strikeId, direction, reason });
    sendJson(res, { ok: true });
  });

  router.post("/api/v1/chat/decision", async (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
      sendError(res, "Unauthorized", 401);
      return;
    }
    const { question } = await readBody<{ question: string }>(req);
    const ctx = await gatherDecisionContext(question, userId);
    const prompt = buildDecisionPrompt(ctx);
    const response = await chatCompletion(
      [
        { role: "system", content: prompt },
        { role: "user", content: question },
      ],
      { temperature: 0.7 },
    );
    sendJson(res, { content: response.content });
  });
}
