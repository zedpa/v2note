import { z } from "zod";
import { recordRepo } from "../../db/repositories/index.js";
export const moveRecordTool = {
    name: "move_record",
    description: `将一条日记移动到指定的分类文件夹。
使用：用户要移动某条日记到另一个分类（"把这条日记移到工作分类"）。
使用：AI 发现某条日记分类不对时主动建议移动。
不用：要批量移动（整个文件夹）→ 用 manage_folder(action:"merge")。
不用：要修改日记内容 → 用 update_record。`,
    parameters: z.object({
        record_id: z.string().min(1).describe("日记 ID"),
        domain: z.string().nullable().describe("目标分类路径，如 '工作/v2note'。传 null 表示移到未分类"),
    }),
    autonomy: "notify",
    handler: async (args, ctx) => {
        const record = await recordRepo.findById(args.record_id);
        if (!record) {
            return { success: false, message: "日记不存在或无权访问" };
        }
        if (record.user_id !== ctx.userId && record.device_id !== ctx.deviceId) {
            return { success: false, message: "日记不存在或无权访问" };
        }
        const oldDomain = record.domain ?? null;
        await recordRepo.updateDomain(args.record_id, args.domain);
        return {
            success: true,
            message: args.domain
                ? `已将日记移动到「${args.domain}」`
                : "已将日记移到未分类",
            data: {
                record_id: args.record_id,
                old_domain: oldDomain,
                new_domain: args.domain,
            },
        };
    },
};
//# sourceMappingURL=move-record.js.map