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
//# sourceMappingURL=jwt.js.map