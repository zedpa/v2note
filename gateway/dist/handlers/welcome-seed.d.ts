/**
 * 欢迎日记种子数据 — 冷启动完成后预存 3 篇日记 + Strike + Bond + Tag。
 *
 * 所有内容硬编码，不走 AI，100% 可控展示。
 * source_type = 'material'，与用户日记样式一致，可删除。
 */
/**
 * 预存欢迎日记到数据库。幂等——如已存在则跳过。
 */
export declare function seedWelcomeDiaries(userId: string, deviceId: string): Promise<{
    created: number;
}>;
