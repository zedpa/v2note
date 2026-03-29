import { z } from "zod";
import { recordRepo, transcriptRepo } from "../../db/repositories/index.js";
export const updateRecordTool = {
    name: "update_record",
    description: `更新日记/笔记内容。
使用：用户要修改已有日记的内容（"把那条日记改一下"、"更新一下内容"）。
不用：用户要创建新日记 → 用 create_record。
不用：用户要删除日记 → 用 delete_record。`,
    parameters: z.object({
        record_id: z.string().min(1).describe("记录 ID"),
        content: z.string().min(1).describe("新的日记内容"),
    }),
    autonomy: "notify",
    handler: async (args, ctx) => {
        const { record_id, content } = args;
        const record = await recordRepo.findById(record_id);
        if (!record)
            return { success: false, message: `记录 ${record_id} 不存在` };
        if (record.device_id !== ctx.deviceId)
            return { success: false, message: "无权修改此记录" };
        // 更新 transcript 文本
        await transcriptRepo.update(record_id, { text: content });
        return {
            success: true,
            message: `日记已更新 (ID: ${record_id})`,
            data: { record_id },
        };
    },
};
//# sourceMappingURL=update-record.js.map