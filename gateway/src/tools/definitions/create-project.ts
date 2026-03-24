import { z } from "zod";
import { notebookRepo } from "../../db/repositories/index.js";
import type { ToolDefinition } from "../types.js";

export const createProjectTool: ToolDefinition = {
  name: "create_project",
  description: `创建一个项目笔记本。创建项目是重大决策，路路会先确认再执行。
使用：用户要创建一个专属项目空间（"建个项目"、"创建笔记本"）。
不用：用户只是创建单条日记 → 用 create_record。
不用：用户要创建目标 → 用 create_goal。`,
  parameters: z.object({
    name: z.string().min(1).describe("项目名称（英文短横线格式，如 project-alpha）"),
    description: z.string().optional().describe("项目描述"),
    color: z.string().optional().describe("颜色（hex格式，如 #6366f1）"),
  }),
  autonomy: "confirm",
  handler: async (args, ctx) => {
    const { name, description, color } = args;

    const notebook = ctx.userId
      ? await notebookRepo.findOrCreateByUser(ctx.userId, ctx.deviceId, name, description ?? "", false, color)
      : await notebookRepo.findOrCreate(ctx.deviceId, name, description ?? "", false, color);

    return {
      success: true,
      message: `项目「${name}」已创建`,
      data: { notebook_id: notebook.id, name: notebook.name },
    };
  },
};
