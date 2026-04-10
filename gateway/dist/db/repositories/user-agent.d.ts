/**
 * user_agent CRUD — 每用户个性化交互规则
 *
 * 存储用户自定义的规则、流程偏好、skill 配置、通知偏好。
 * 不包含 AI 人格内容（那是 Soul 的领域）。
 */
export interface UserAgent {
    id: string;
    user_id: string;
    content: string;
    template_version: number;
    created_at: string;
    updated_at: string;
}
/** 当前模板版本 */
export declare const CURRENT_TEMPLATE_VERSION = 1;
/** 默认模板 */
export declare const DEFAULT_TEMPLATE = "## \u6211\u7684\u89C4\u5219\n\uFF08\u7528\u6237\u81EA\u5B9A\u4E49\u7684\u505A\u4E8B\u89C4\u5219\uFF0CAI \u5FC5\u987B\u9075\u5B88\uFF09\n\n## \u6211\u7684\u6D41\u7A0B\u504F\u597D\n- \u5F55\u97F3\u540E\u81EA\u52A8\u6574\u7406\u6210\u65E5\u8BB0\n- \u5F85\u529E\u521B\u5EFA\u540E\u6309\u9879\u76EE\u5206\u7EC4\n\n## \u6280\u80FD\u914D\u7F6E\n\uFF08\u6240\u6709\u6280\u80FD\u9ED8\u8BA4\u5173\u95ED\uFF0C\u7528\u6237\u660E\u786E\u5F00\u542F\u540E\u624D\u53EF\u7528\uFF09\n\n## \u901A\u77E5\u504F\u597D\n- \u6668\u95F4\u7B80\u62A5: \u5F00\u542F\uFF08\u65E9\u4E0A 9:00\uFF09\n- \u665A\u95F4\u56DE\u987E: \u5F00\u542F\uFF08\u665A\u4E0A 21:00\uFF09\n- \u4E3B\u52A8\u95EE\u5019: \u5173\u95ED";
/** 按 userId 查找，不存在则用默认模板创建 */
export declare function findOrCreate(userId: string): Promise<UserAgent>;
/** 按 userId 查找（不自动创建） */
export declare function findByUser(userId: string): Promise<UserAgent | null>;
/** 更新 content */
export declare function updateContent(userId: string, content: string): Promise<void>;
/** 更新 content + template_version（模板升级时用） */
export declare function updateWithVersion(userId: string, content: string, version: number): Promise<void>;
