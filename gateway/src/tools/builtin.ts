/**
 * Built-in tools that the AI can invoke during processing or chat.
 * These run in-process (no MCP server needed).
 */

import { recordRepo, transcriptRepo, summaryRepo, customSkillRepo } from "../db/repositories/index.js";

export interface BuiltinToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Definitions exposed to the AI via system prompt.
 */
export const BUILTIN_TOOLS: BuiltinToolDef[] = [
  {
    name: "create_diary",
    description: "创建一条新的日记/笔记。用户在对话中要求你帮忙记录内容时使用此工具。",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "日记正文内容" },
        title: { type: "string", description: "标题（可选，不超过50字）" },
      },
      required: ["content"],
    },
  },
  {
    name: "delete_diary",
    description: "删除指定的日记/笔记。用户明确要求删除某条记录时使用此工具。需要提供记录 ID。",
    parameters: {
      type: "object",
      properties: {
        record_id: { type: "string", description: "要删除的记录 ID" },
      },
      required: ["record_id"],
    },
  },
  {
    name: "create_skill",
    description: "创建一个新的复盘视角技能。当用户总结出有价值的思考框架时，保存为可复用的复盘视角。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "技能名称（如'用户体验视角'）" },
        description: { type: "string", description: "简短描述" },
        prompt: { type: "string", description: "提示词/引导指令" },
      },
      required: ["name", "prompt"],
    },
  },
];

/**
 * Check if a tool name is a built-in tool.
 */
export function isBuiltinTool(name: string): boolean {
  return BUILTIN_TOOLS.some((t) => t.name === name);
}

/**
 * Execute a built-in tool call.
 */
export async function callBuiltinTool(
  name: string,
  args: Record<string, unknown>,
  deviceId: string,
): Promise<ToolCallResult> {
  switch (name) {
    case "create_diary":
      return handleCreateDiary(args, deviceId);
    case "delete_diary":
      return handleDeleteDiary(args, deviceId);
    case "create_skill":
      return handleCreateSkill(args, deviceId);
    default:
      return { success: false, message: `Unknown built-in tool: ${name}` };
  }
}

async function handleCreateDiary(
  args: Record<string, unknown>,
  deviceId: string,
): Promise<ToolCallResult> {
  const content = String(args.content ?? "").trim();
  if (!content) {
    return { success: false, message: "content 不能为空" };
  }

  const title = String(args.title ?? content.slice(0, 50));

  // Create record
  const record = await recordRepo.create({
    device_id: deviceId,
    status: "completed",
    source: "manual",
  });

  // Create transcript
  await transcriptRepo.create({
    record_id: record.id,
    text: content,
    language: "zh",
  });

  // Create summary
  await summaryRepo.create({
    record_id: record.id,
    title,
    short_summary: content,
  });

  console.log(`[builtin-tool] create_diary: record ${record.id} created for device ${deviceId}`);

  return {
    success: true,
    message: `日记已创建 (ID: ${record.id})`,
    data: { record_id: record.id, title },
  };
}

async function handleDeleteDiary(
  args: Record<string, unknown>,
  deviceId: string,
): Promise<ToolCallResult> {
  const recordId = String(args.record_id ?? "").trim();
  if (!recordId) {
    return { success: false, message: "record_id 不能为空" };
  }

  // Verify the record belongs to this device
  const record = await recordRepo.findById(recordId);
  if (!record) {
    return { success: false, message: `记录 ${recordId} 不存在` };
  }
  if (record.device_id !== deviceId) {
    return { success: false, message: "无权删除此记录" };
  }

  const count = await recordRepo.deleteByIds([recordId]);
  console.log(`[builtin-tool] delete_diary: record ${recordId} deleted (affected: ${count})`);

  return {
    success: true,
    message: `日记已删除 (ID: ${recordId})`,
    data: { record_id: recordId, deleted: count },
  };
}

async function handleCreateSkill(
  args: Record<string, unknown>,
  deviceId: string,
): Promise<ToolCallResult> {
  const name = String(args.name ?? "").trim();
  const prompt = String(args.prompt ?? "").trim();
  const description = String(args.description ?? "").trim();

  if (!name) {
    return { success: false, message: "name 不能为空" };
  }
  if (!prompt) {
    return { success: false, message: "prompt 不能为空" };
  }

  // Check for duplicate name
  const existing = await customSkillRepo.findByDeviceAndName(deviceId, name);
  if (existing) {
    return { success: false, message: `技能 "${name}" 已存在` };
  }

  const skill = await customSkillRepo.create({
    device_id: deviceId,
    name,
    description,
    prompt,
    type: "review",
    created_by: "ai",
  });

  console.log(`[builtin-tool] create_skill: "${name}" created for device ${deviceId}`);

  return {
    success: true,
    message: `复盘视角「${name}」已创建`,
    data: { id: skill.id, name: skill.name },
  };
}
