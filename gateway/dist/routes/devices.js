import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { deviceRepo } from "../db/repositories/index.js";
export function registerDeviceRoutes(router) {
    // Register device（原子操作：防止并发重复创建欢迎日记）
    router.post("/api/v1/devices/register", async (req, res) => {
        const { identifier, platform } = await readBody(req);
        if (!identifier) {
            sendJson(res, { error: "identifier is required" }, 400);
            return;
        }
        const { device, isNew } = await deviceRepo.findOrCreate(identifier, platform ?? "unknown");
        if (isNew) {
            // 欢迎日记在 onboarding Q5 完成后由 seedWelcomeDiaries 创建
            // 此处不再创建旧版单条欢迎日记
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
        const body = await readBody(req);
        await deviceRepo.update(deviceId, body);
        sendJson(res, { ok: true });
    });
}
//# sourceMappingURL=devices.js.map