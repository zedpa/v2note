import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { deviceRepo, recordRepo, transcriptRepo, summaryRepo } from "../db/repositories/index.js";
const INITIAL_DIARY_TITLE = "说出来，就是做完了";
const INITIAL_DIARY_CONTENT = [
    "你每天说上万句话。重要的承诺、闪过的想法、别人的请求——说完就忘了。",
    "",
    "v2note 让你说出来的每一句话，都不会白说。",
    "",
    "它不只是录音转文字。你说一句话，AI 帮你记住、分类、排优先级、到时间提醒你、能做的替你做。",
    "",
    "—— 30 秒上手 ——",
    "",
    "试试长按底部麦克风，说这句话：",
    "「明天下午三点开会，要提前准备会议纪要，下班顺路买点牙膏。」",
    "",
    "松手后，你会看到 AI 自动提取了两条待办：",
    "· 准备会议纪要 → 工作，影响力高，AI 可以帮你整理",
    "· 买牙膏 → 生活，影响力低，安静排在后面",
    "",
    "明天早上，你会收到一份晨间简报，告诉你今天最重要的事。如果会议纪要还没准备，AI 会主动问你：「要不要我帮你整理？」",
    "",
    "—— 更多用法 ——",
    "",
    "· 长按录音，松手保存 — 最快的记录方式",
    "· 上滑松手 → 语音指令模式，直接让 AI 执行（不创建日记）",
    "· 右滑松手 → 常驻录音，适合会议等长时间场景",
    "· 点击输入框 → 文字笔记",
    "· 输入 / → AI 对话指令（试试 /todos 查看待办）",
    "",
    "—— AI 越用越懂你 ——",
    "",
    "当你说「我这个季度最重要的是完成融资」，AI 会记住这个目标。之后每次你录入新待办，AI 会对照你的目标评估影响力——和融资相关的事排在前面，买牙膏排在后面。",
    "",
    "左侧菜单 → 个人画像，可以看到 AI 对你的理解。你用得越多，它越懂你的优先级。",
    "",
    "现在，试着说一句话吧。",
].join("\n");
async function createInitialDiaryForDevice(deviceId) {
    const record = await recordRepo.create({
        device_id: deviceId,
        status: "completed",
        source: "manual",
    });
    await transcriptRepo.create({
        record_id: record.id,
        text: INITIAL_DIARY_CONTENT,
        language: "zh",
    });
    await summaryRepo.create({
        record_id: record.id,
        title: INITIAL_DIARY_TITLE,
        short_summary: INITIAL_DIARY_CONTENT,
    });
}
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
            try {
                await createInitialDiaryForDevice(device.id);
            }
            catch (err) {
                console.warn(`[devices] Failed to create initial diary for device ${device.id}: ${err.message}`);
            }
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