import { z } from "zod";
import { recordRepo } from "../../db/repositories/index.js";
export const deleteRecordTool = {
    name: "delete_record",
    description: `删除日记/笔记。⚠️ 此操作不可恢复，必须先确认用户明确要求删除。
使用：用户明确要求删除（"把那条日记删了"、"删除这条记录"）。
不用：用户只是想归档 → 建议归档而非删除。
不用：用户想移动日记到其他分类 → 用 move_record。`,
    parameters: z.object({
        record_id: z.string().min(1).describe("要删除的记录 ID"),
    }),
    autonomy: "confirm",
    handler: async (args, ctx) => {
        const { record_id } = args;
        const record = await recordRepo.findById(record_id);
        if (!record)
            return { success: false, message: `记录 ${record_id} 不存在` };
        if (record.device_id !== ctx.deviceId)
            return { success: false, message: "无权删除此记录" };
        const count = await recordRepo.deleteByIds([record_id]);
        return {
            success: true,
            message: `日记已删除 (ID: ${record_id})`,
            data: { record_id, deleted: count },
        };
    },
};
//# sourceMappingURL=delete-record.js.map