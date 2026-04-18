/**
 * 前端幂等键（client_id / localId）格式校验
 *
 * Spec: fix-cold-resume-silent-loss §6 & Phase 3 对抗性审查 A2
 *
 * 契约：
 *   - client_id 由前端生成的 UUID（典型 v4 = 36 字符含连字符）
 *   - 仅允许 [0-9a-fA-F-]，长度 32-64（放宽以兼容其他 UUID 变体/扩展）
 *   - 非法输入（空白、非字符串、注入字符、超长）→ 视为未传（返回 false）
 *   - **不**对非法输入抛错，避免阻塞用户请求；调用方应记录 warn 日志后走普通创建分支。
 */

/** 仅允许 UUID 风格字符，长度 32-64 */
const CLIENT_ID_RE = /^[0-9a-fA-F-]{32,64}$/;

/**
 * 判断是否为合法 client_id。
 * 类型守卫：通过后 v 可被视为 `string`。
 */
export function isValidClientId(v: unknown): v is string {
  if (typeof v !== "string") return false;
  if (v.length < 32 || v.length > 64) return false;
  return CLIENT_ID_RE.test(v);
}
