import type { Router } from "../router.js";
import { readBody, sendJson, sendError, getDeviceId } from "../lib/http-helpers.js";
import { skillConfigRepo, customSkillRepo } from "../db/repositories/index.js";
import { loadSkills } from "../skills/loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../../skills");

export function registerSkillRoutes(router: Router) {
  // List skills (built-in + custom, merged)
  router.get("/api/v1/skills", async (req, res) => {
    const deviceId = getDeviceId(req);
    const builtinSkills = loadSkills(SKILLS_DIR);
    const configs = await skillConfigRepo.findByDevice(deviceId);
    const configMap = Object.fromEntries(configs.map((c) => [c.skill_name, c]));

    // Built-in skills
    const items: any[] = builtinSkills.map((skill) => ({
      name: skill.name,
      description: skill.description,
      enabled: configMap[skill.name]?.enabled ?? true,
      always: skill.metadata?.always ?? false,
      type: undefined,
      builtin: true,
    }));

    // Custom skills from DB
    try {
      const customs = await customSkillRepo.findByDevice(deviceId);
      for (const cs of customs) {
        items.push({
          name: cs.name,
          description: cs.description,
          prompt: cs.prompt,
          enabled: cs.enabled,
          always: false,
          type: cs.type,
          builtin: false,
          created_by: cs.created_by,
        });
      }
    } catch (err: any) {
      console.warn(`[skills] Failed to load custom skills: ${err.message}`);
    }

    sendJson(res, items);
  });

  // Get single skill detail
  router.get("/api/v1/skills/:name", async (req, res, params) => {
    const deviceId = getDeviceId(req);

    // Check built-in first
    const allSkills = loadSkills(SKILLS_DIR);
    const skill = allSkills.find((s) => s.name === params.name);
    if (skill) {
      const configs = await skillConfigRepo.findByDevice(deviceId);
      const cfg = configs.find((c) => c.skill_name === params.name);
      sendJson(res, {
        name: skill.name,
        description: skill.description,
        prompt: skill.prompt,
        always: skill.metadata?.always ?? false,
        enabled: cfg?.enabled ?? true,
        type: undefined,
        builtin: true,
      });
      return;
    }

    // Check custom skills
    try {
      const custom = await customSkillRepo.findByDeviceAndName(deviceId, params.name);
      if (custom) {
        sendJson(res, {
          name: custom.name,
          description: custom.description,
          prompt: custom.prompt,
          always: false,
          enabled: custom.enabled,
          type: custom.type,
          builtin: false,
          created_by: custom.created_by,
        });
        return;
      }
    } catch {
      // fall through
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Skill not found" }));
  });

  // Toggle skill (built-in)
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

  // Create custom skill
  router.post("/api/v1/skills", async (req, res) => {
    const deviceId = getDeviceId(req);
    const body = await readBody<{
      name: string;
      description?: string;
      prompt: string;
      type?: "review" | "process";
    }>(req);

    if (!body.name?.trim() || !body.prompt?.trim()) {
      sendError(res, "name and prompt are required", 400);
      return;
    }

    const existing = await customSkillRepo.findByDeviceAndName(deviceId, body.name);
    if (existing) {
      sendError(res, `Skill "${body.name}" already exists`, 409);
      return;
    }

    const skill = await customSkillRepo.create({
      device_id: deviceId,
      name: body.name.trim(),
      description: body.description?.trim(),
      prompt: body.prompt.trim(),
      type: body.type ?? "review",
      created_by: "user",
    });

    sendJson(res, skill);
  });

  // Update custom skill
  router.put("/api/v1/skills/:name", async (req, res, params) => {
    const deviceId = getDeviceId(req);

    // Only allow editing non-builtin skills
    const builtinSkills = loadSkills(SKILLS_DIR);
    if (builtinSkills.some((s) => s.name === params.name)) {
      sendError(res, "Cannot edit built-in skills", 403);
      return;
    }

    const custom = await customSkillRepo.findByDeviceAndName(deviceId, params.name);
    if (!custom) {
      sendError(res, "Skill not found", 404);
      return;
    }

    const body = await readBody<{
      name?: string;
      description?: string;
      prompt?: string;
      type?: "review" | "process";
      enabled?: boolean;
    }>(req);

    await customSkillRepo.update(custom.id, body);
    sendJson(res, { ok: true });
  });

  // Delete custom skill
  router.delete("/api/v1/skills/:name", async (req, res, params) => {
    const deviceId = getDeviceId(req);

    // Only allow deleting non-builtin skills
    const builtinSkills = loadSkills(SKILLS_DIR);
    if (builtinSkills.some((s) => s.name === params.name)) {
      sendError(res, "Cannot delete built-in skills", 403);
      return;
    }

    const count = await customSkillRepo.deleteByName(deviceId, params.name);
    if (count === 0) {
      sendError(res, "Skill not found", 404);
      return;
    }

    sendJson(res, { ok: true });
  });
}
