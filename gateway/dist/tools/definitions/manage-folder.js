import { z } from "zod";
import { recordRepo } from "../../db/repositories/index.js";
export const manageFolderTool = {
    name: "manage_folder",
    description: `管理日记的自动分类文件夹。
使用：用户要创建、重命名、删除、合并文件夹分类（"新建一个旅行分类"、"把杂项合并到工作"）。
不用：要移动单条日记到某个分类 → 用 move_record。
不用：要搜索某个分类下的日记 → 用 search(filters.domain)。`,
    parameters: z.object({
        action: z.enum(["create", "rename", "delete", "merge"]).describe("操作类型"),
        name: z.string().optional().describe("文件夹名（create/delete 时必填）"),
        old_name: z.string().optional().describe("旧名称（rename 时必填）"),
        new_name: z.string().optional().describe("新名称（rename 时必填）"),
        source: z.string().optional().describe("源文件夹（merge 时必填）"),
        target: z.string().optional().describe("目标文件夹（merge 时必填）"),
    }),
    autonomy: "confirm",
    handler: async (args, ctx) => {
        if (!ctx.userId) {
            return { success: false, message: "需要用户身份" };
        }
        switch (args.action) {
            case "create": {
                if (!args.name) {
                    return { success: false, message: "创建文件夹需要提供 name" };
                }
                // 检查是否已存在
                const existing = await recordRepo.listUserDomains(ctx.userId);
                if (existing.includes(args.name)) {
                    return { success: false, message: `分类「${args.name}」已存在` };
                }
                // 文件夹在首条记录归入时自动生效，这里只需确认不重复
                return {
                    success: true,
                    message: `已创建分类「${args.name}」`,
                    data: { folder: args.name },
                    next_hint: "可以用 move_record 将日记移入此分类",
                };
            }
            case "rename": {
                if (!args.old_name || !args.new_name) {
                    return { success: false, message: "重命名需要提供 old_name 和 new_name" };
                }
                const count = await recordRepo.batchUpdateDomain(ctx.userId, args.old_name, args.new_name);
                return {
                    success: true,
                    message: `已将「${args.old_name}」重命名为「${args.new_name}」，影响 ${count} 条记录`,
                    data: { old_name: args.old_name, new_name: args.new_name, affected_count: count },
                };
            }
            case "delete": {
                if (!args.name) {
                    return { success: false, message: "删除文件夹需要提供 name" };
                }
                const count = await recordRepo.clearDomainByPrefix(ctx.userId, args.name);
                return {
                    success: true,
                    message: `已删除分类「${args.name}」，${count} 条记录变为未分类`,
                    data: { folder: args.name, affected_count: count },
                };
            }
            case "merge": {
                if (!args.source || !args.target) {
                    return { success: false, message: "合并需要提供 source 和 target" };
                }
                const count = await recordRepo.batchUpdateDomain(ctx.userId, args.source, args.target);
                return {
                    success: true,
                    message: `已将「${args.source}」合并到「${args.target}」，影响 ${count} 条记录`,
                    data: { source: args.source, target: args.target, affected_count: count },
                };
            }
            default:
                return { success: false, message: `未知操作: ${args.action}` };
        }
    },
};
//# sourceMappingURL=manage-folder.js.map