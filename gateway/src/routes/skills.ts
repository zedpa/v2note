import type { Router } from "../router.js";
import { readBody, sendJson, getDeviceId } from "../lib/http-helpers.js";
import { skillConfigRepo } from "../db/repositories/index.js";
import { loadSkills } from "../skills/loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

export function registerSkillRoutes(router: Router) {
  // List skills (built-in + device config)
  router.get("/api/v1/skills", async (req, res) => {
    const deviceId = getDeviceId(req);
    const allSkills = loadSkills(SKILLS_DIR);
    const configs = await skillConfigRepo.findByDevice(deviceId);
    const configMap = Object.fromEntries(configs.map((c) => [c.skill_name, c]));

    const items = allSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      enabled: configMap[skill.name]?.enabled ?? true,
      always: skill.metadata?.always ?? false,
    }));

    sendJson(res, items);
  });

  // Get single skill detail
  router.get("/api/v1/skills/:name", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const allSkills = loadSkills(SKILLS_DIR);
    const skill = allSkills.find((s) => s.name === params.name);
    if (!skill) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Skill not found" }));
      return;
    }

    const configs = await skillConfigRepo.findByDevice(deviceId);
    const cfg = configs.find((c) => c.skill_name === params.name);

    sendJson(res, {
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt,
      always: skill.metadata?.always ?? false,
      enabled: cfg?.enabled ?? true,
    });
  });

  // Toggle skill
  router.patch("/api/v1/skills/:name", async (req, res, params) => {
    const deviceId = getDeviceId(req);
    const { enabled } = await readBody<{ enabled: boolean }>(req);
    await skillConfigRepo.upsert({
      device_id: deviceId,
      skill_name: params.name,
      enabled,
    });
    sendJson(res, { ok: true });
  });
}
