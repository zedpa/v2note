import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { deviceRepo } from "../db/repositories/index.js";

export function registerDeviceRoutes(router: Router) {
  // Register device
  router.post("/api/v1/devices/register", async (req, res) => {
    const { identifier, platform } = await readBody<{
      identifier: string;
      platform?: string;
    }>(req);
    if (!identifier) {
      sendJson(res, { error: "identifier is required" }, 400);
      return;
    }
    let device = await deviceRepo.findByIdentifier(identifier);
    if (!device) {
      device = await deviceRepo.create(identifier, platform ?? "unknown");
    }
    sendJson(res, { id: device.id });
  });

  // Lookup device
  router.get("/api/v1/devices/lookup", async (req, _res, _params, query) => {
    const identifier = query.identifier;
    if (!identifier) {
      sendJson(_res, { error: "identifier query param is required" }, 400);
      return;
    }
    const device = await deviceRepo.findByIdentifier(identifier);
    if (!device) {
      sendJson(_res, { error: "Device not found" }, 404);
      return;
    }
    sendJson(_res, {
      id: device.id,
      user_type: device.user_type,
      custom_tags: device.custom_tags,
    });
  });

  // Update device settings
  router.patch("/api/v1/devices/settings", async (req, res) => {
    const deviceId = getDeviceId(req);
    const body = await readBody<{ user_type?: string; custom_tags?: any }>(req);
    await deviceRepo.update(deviceId, body);
    sendJson(res, { ok: true });
  });
}
