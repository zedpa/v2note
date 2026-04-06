import jwt from "jsonwebtoken";
const SECRET = process.env.JWT_SECRET ?? "dev-jwt-secret-change-me";
export function signAccessToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: "2h" });
}
export function signRefreshToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}
export function verifyAccessToken(token) {
    return jwt.verify(token, SECRET);
}
export function verifyRefreshToken(token) {
    return jwt.verify(token, SECRET);
}
/** 签发邮箱验证 token（验证码通过后，用于后续操作，10 分钟有效） */
export function signEmailVerificationToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: "10m" });
}
/** 验证邮箱验证 token */
export function verifyEmailVerificationToken(token) {
    return jwt.verify(token, SECRET);
}
//# sourceMappingURL=jwt.js.map