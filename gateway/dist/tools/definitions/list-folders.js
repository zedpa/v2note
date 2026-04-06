import { z } from "zod";
import { recordRepo } from "../../db/repositories/index.js";
export const listFoldersTool = {
    name: "list_folders",
    description: `列出用户的所有分类文件夹及记录数。
使用：需要了解用户的分类体系（"我有哪些分类"、移动记录前先查看可选分类）。
使用：manage_folder 操作前确认目标文件夹是否存在。
不用：要搜索具体内容 → 用 search。`,
    parameters: z.object({}),
    autonomy: "silent",
    handler: async (_args, ctx) => {
        if (!ctx.userId) {
            return { success: false, message: "需要用户身份" };
        }
        const [folders, uncategorizedCount] = await Promise.all([
            recordRepo.listUserDomainsWithCount(ctx.userId),
            recordRepo.countUncategorized(ctx.userId),
        ]);
        return {
            success: true,
            message: `共 ${folders.length} 个分类，${uncategorizedCount} 条未分类`,
            data: {
                folders,
                uncategorized_count: uncategorizedCount,
            },
        };
    },
};
//# sourceMappingURL=list-folders.js.map