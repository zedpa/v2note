import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { goalRepo, pendingIntentRepo } from "../db/repositories/index.js";
export function registerGoalRoutes(router) {
    // List active goals
    router.get("/api/v1/goals", async (req, res) => {
        const deviceId = getDeviceId(req);
        const goals = await goalRepo.findActiveByDevice(deviceId);
        sendJson(res, goals);
    });
    // Create goal
    router.post("/api/v1/goals", async (req, res) => {
        const deviceId = getDeviceId(req);
        const { title, parent_id, source } = await readBody(req);
        const goal = await goalRepo.create({ device_id: deviceId, title, parent_id, source });
        sendJson(res, goal, 201);
    });
    // Update goal
    router.patch("/api/v1/goals/:id", async (req, res, params) => {
        const body = await readBody(req);
        await goalRepo.update(params.id, body);
        sendJson(res, { ok: true });
    });
    // Get goal with associated todos
    router.get("/api/v1/goals/:id/todos", async (_req, res, params) => {
        const todos = await goalRepo.findWithTodos(params.id);
        sendJson(res, todos);
    });
    // List pending intents
    router.get("/api/v1/intents/pending", async (req, res) => {
        const deviceId = getDeviceId(req);
        const intents = await pendingIntentRepo.findPendingByDevice(deviceId);
        sendJson(res, intents);
    });
}
//# sourceMappingURL=goals.js.map