import { describe, it, expect, vi, beforeEach } from "vitest";
/**
 * 邮箱认证后端测试
 * 覆盖 spec auth-core.md 章节 3-5 的场景
 *
 * Mock 策略：mock DB 和 Resend，测试路由处理逻辑
 */
// ── Mock 依赖 ──
vi.mock("../db/pool.js", () => ({
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue(0),
    getPool: vi.fn(),
}));
vi.mock("../db/repositories/app-user.js", () => ({
    findById: vi.fn().mockResolvedValue(null),
    findByPhone: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "user-1", phone: "13800138000", email: null, password_hash: "hash", display_name: null, avatar_url: null, created_at: "2026-01-01" }),
    createWithEmail: vi.fn().mockResolvedValue({ id: "user-new", phone: null, email: "test@example.com", password_hash: "hash", display_name: null, avatar_url: null, created_at: "2026-01-01" }),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    updateEmail: vi.fn().mockResolvedValue({ id: "user-1", phone: "13800138000", email: "user@example.com", password_hash: "hash", display_name: "Tester", avatar_url: null, created_at: "2026-01-01" }),
    updateProfile: vi.fn().mockResolvedValue({ id: "user-1", phone: "13800138000", email: null, password_hash: "hash", display_name: "Tester", avatar_url: null, created_at: "2026-01-01" }),
}));
vi.mock("../auth/email.js", () => ({
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    generateCode: vi.fn().mockReturnValue("123456"),
}));
vi.mock("../auth/passwords.js", () => ({
    hashPassword: vi.fn().mockResolvedValue("$2a$12$hashed"),
    verifyPassword: vi.fn().mockResolvedValue(true),
}));
vi.mock("../auth/jwt.js", () => ({
    signAccessToken: vi.fn().mockReturnValue("mock-access-token"),
    signRefreshToken: vi.fn().mockReturnValue("mock-refresh-token"),
    verifyAccessToken: vi.fn().mockReturnValue({ userId: "user-1", deviceId: "dev-1" }),
    verifyRefreshToken: vi.fn().mockReturnValue({ userId: "user-1", tokenId: "tid-1" }),
    signEmailVerificationToken: vi.fn().mockReturnValue("mock-verification-token"),
    verifyEmailVerificationToken: vi.fn().mockReturnValue({ email: "test@example.com", purpose: "register" }),
}));
vi.mock("../auth/link-device.js", () => ({
    linkDeviceToUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../db/repositories/refresh-token.js", () => ({
    hashToken: vi.fn().mockReturnValue("hashed-token"),
    create: vi.fn().mockResolvedValue({}),
    findByHash: vi.fn().mockResolvedValue(null),
    deleteByHash: vi.fn().mockResolvedValue(undefined),
    deleteByUser: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../db/repositories/index.js", () => ({
    deviceRepo: { findByDeviceIdentifier: vi.fn().mockResolvedValue(null) },
}));
// ── 辅助：模拟 req/res ──
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
function createMockReq(method, url, body, headers) {
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    req.headers = { host: "localhost", ...headers };
    // 模拟 body stream
    if (body) {
        const json = JSON.stringify(body);
        process.nextTick(() => {
            req.push(json);
            req.push(null);
        });
    }
    else {
        process.nextTick(() => req.push(null));
    }
    return req;
}
function createMockRes() {
    const socket = new Socket();
    const res = new ServerResponse(new IncomingMessage(socket));
    res._status = 200;
    res._body = null;
    res.writeHead = vi.fn((status) => {
        res._status = status;
        return res;
    });
    res.end = vi.fn((data) => {
        if (data)
            res._body = JSON.parse(data);
    });
    return res;
}
// ── 导入被测模块 ──
import * as appUserRepo from "../db/repositories/app-user.js";
import * as emailVerificationRepo from "../db/repositories/email-verification.js";
import { sendVerificationEmail } from "../auth/email.js";
import * as refreshTokenRepo from "../db/repositories/refresh-token.js";
import { verifyPassword } from "../auth/passwords.js";
import { verifyEmailVerificationToken } from "../auth/jwt.js";
import { Router } from "../router.js";
import { registerAuthRoutes } from "./auth.js";
// ── Mock email-verification repo ──
vi.mock("../db/repositories/email-verification.js", () => ({
    create: vi.fn().mockResolvedValue({
        id: "ver-1",
        email: "test@example.com",
        code: "123456",
        purpose: "register",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        attempts: 0,
        used: false,
    }),
    findLatestUnused: vi.fn().mockResolvedValue(null),
    incrementAttempts: vi.fn().mockResolvedValue(undefined),
    markUsed: vi.fn().mockResolvedValue(undefined),
    findRecentByEmail: vi.fn().mockResolvedValue(null),
}));
// ── 测试 ──
describe("Email Auth — send-email-code", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 3.1：发送邮箱验证码
    it("should_send_verification_code_when_valid_email_and_not_registered", async () => {
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue(null);
        vi.mocked(emailVerificationRepo.findRecentByEmail).mockResolvedValue(null);
        const req = createMockReq("POST", "/api/v1/auth/send-email-code", {
            email: "test@example.com",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body).toEqual({ ok: true, expiresIn: 300 });
        expect(sendVerificationEmail).toHaveBeenCalledWith("test@example.com", expect.any(String));
        expect(emailVerificationRepo.create).toHaveBeenCalled();
    });
    // 场景 3.2：60 秒内重复发送
    it("should_return_429_when_resend_within_60_seconds", async () => {
        vi.mocked(emailVerificationRepo.findRecentByEmail).mockResolvedValue({
            id: "ver-old",
            email: "test@example.com",
            code: "654321",
            purpose: "register",
            expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
            attempts: 0,
            used: false,
            created_at: new Date(Date.now() - 30 * 1000).toISOString(), // 30 秒前发的
        });
        const req = createMockReq("POST", "/api/v1/auth/send-email-code", {
            email: "test@example.com",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(429);
        expect(sendVerificationEmail).not.toHaveBeenCalled();
    });
    // 邮箱已注册时 purpose=register 返回 409
    it("should_return_409_when_email_already_registered_for_register_purpose", async () => {
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue({
            id: "user-1",
            phone: null,
            email: "test@example.com",
            password_hash: "hash",
            display_name: null,
            avatar_url: null,
            created_at: "2026-01-01",
        });
        const req = createMockReq("POST", "/api/v1/auth/send-email-code", {
            email: "test@example.com",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(409);
    });
    // 邮箱格式无效
    it("should_return_400_when_email_format_invalid", async () => {
        const req = createMockReq("POST", "/api/v1/auth/send-email-code", {
            email: "not-an-email",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(400);
    });
});
describe("Email Auth — verify-email-code", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 3.3：验证码校验成功
    it("should_return_verification_token_when_code_correct", async () => {
        vi.mocked(emailVerificationRepo.findLatestUnused).mockResolvedValue({
            id: "ver-1",
            email: "test@example.com",
            code: "123456",
            purpose: "register",
            expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            attempts: 0,
            used: false,
            created_at: new Date().toISOString(),
        });
        const req = createMockReq("POST", "/api/v1/auth/verify-email-code", {
            email: "test@example.com",
            code: "123456",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body).toHaveProperty("ok", true);
        expect(res._body).toHaveProperty("verificationToken");
        expect(emailVerificationRepo.markUsed).toHaveBeenCalledWith("ver-1");
    });
    // 场景 3.4：验证码输入错误
    it("should_return_400_and_decrement_attempts_when_code_wrong", async () => {
        vi.mocked(emailVerificationRepo.findLatestUnused).mockResolvedValue({
            id: "ver-1",
            email: "test@example.com",
            code: "123456",
            purpose: "register",
            expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            attempts: 0,
            used: false,
            created_at: new Date().toISOString(),
        });
        const req = createMockReq("POST", "/api/v1/auth/verify-email-code", {
            email: "test@example.com",
            code: "000000",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(400);
        expect(res._body.remainingAttempts).toBe(2);
        expect(emailVerificationRepo.incrementAttempts).toHaveBeenCalledWith("ver-1");
    });
    // 场景 3.5：3 次失败后作废
    it("should_return_429_and_mark_used_when_attempts_exhausted", async () => {
        vi.mocked(emailVerificationRepo.findLatestUnused).mockResolvedValue({
            id: "ver-1",
            email: "test@example.com",
            code: "123456",
            purpose: "register",
            expires_at: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
            attempts: 2,
            used: false,
            created_at: new Date().toISOString(),
        });
        const req = createMockReq("POST", "/api/v1/auth/verify-email-code", {
            email: "test@example.com",
            code: "000000",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(429);
        expect(emailVerificationRepo.markUsed).toHaveBeenCalledWith("ver-1");
    });
    // 场景 3.6：验证码过期
    it("should_return_410_when_no_valid_code_found", async () => {
        vi.mocked(emailVerificationRepo.findLatestUnused).mockResolvedValue(null);
        const req = createMockReq("POST", "/api/v1/auth/verify-email-code", {
            email: "test@example.com",
            code: "123456",
            purpose: "register",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(410);
    });
});
describe("Email Auth — register with email", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 3.7：邮箱注册
    it("should_create_user_with_email_when_verification_token_valid", async () => {
        vi.mocked(verifyEmailVerificationToken).mockReturnValue({
            email: "test@example.com",
            purpose: "register",
        });
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue(null);
        vi.mocked(appUserRepo.createWithEmail).mockResolvedValue({
            id: "user-new",
            phone: null,
            email: "test@example.com",
            password_hash: "$2a$12$hashed",
            display_name: "Tester",
            avatar_url: null,
            created_at: "2026-04-04",
        });
        const req = createMockReq("POST", "/api/v1/auth/register", {
            email: "test@example.com",
            verificationToken: "valid-vtoken",
            password: "Test123456",
            displayName: "Tester",
            deviceId: "dev-1",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(201);
        expect(res._body.user.email).toBe("test@example.com");
        expect(res._body).toHaveProperty("accessToken");
    });
});
describe("Email Auth — login with email", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 3.8：邮箱登录
    it("should_login_with_email_and_password", async () => {
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue({
            id: "user-1",
            phone: null,
            email: "test@example.com",
            password_hash: "$2a$12$correct",
            display_name: "Tester",
            avatar_url: null,
            created_at: "2026-04-04",
        });
        vi.mocked(verifyPassword).mockResolvedValue(true);
        const req = createMockReq("POST", "/api/v1/auth/login", {
            email: "test@example.com",
            password: "Test123456",
            deviceId: "dev-1",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body.user.email).toBe("test@example.com");
        expect(res._body).toHaveProperty("accessToken");
    });
    // 邮箱不存在
    it("should_return_401_when_email_not_found", async () => {
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue(null);
        const req = createMockReq("POST", "/api/v1/auth/login", {
            email: "unknown@example.com",
            password: "whatever",
            deviceId: "dev-1",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(401);
    });
});
describe("Email Auth — reset-password", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 4.1：正常重置密码
    it("should_reset_password_and_revoke_all_tokens", async () => {
        vi.mocked(verifyEmailVerificationToken).mockReturnValue({
            email: "test@example.com",
            purpose: "reset_password",
        });
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue({
            id: "user-1",
            phone: "13800138000",
            email: "test@example.com",
            password_hash: "$2a$12$old",
            display_name: "Tester",
            avatar_url: null,
            created_at: "2026-04-04",
        });
        const req = createMockReq("POST", "/api/v1/auth/reset-password", {
            email: "test@example.com",
            verificationToken: "valid-vtoken",
            newPassword: "NewPass123",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body).toEqual({ ok: true });
        // 应该删除该用户所有 refresh token
        expect(refreshTokenRepo.deleteByUser).toHaveBeenCalledWith("user-1");
        // 应该更新密码
        expect(appUserRepo.updatePassword).toHaveBeenCalledWith("user-1", "$2a$12$hashed");
    });
    // 场景 4.4：密码太短
    it("should_return_400_when_new_password_too_short", async () => {
        vi.mocked(verifyEmailVerificationToken).mockReturnValue({
            email: "test@example.com",
            purpose: "reset_password",
        });
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue({
            id: "user-1",
            phone: null,
            email: "test@example.com",
            password_hash: "$2a$12$old",
            display_name: null,
            avatar_url: null,
            created_at: "2026-04-04",
        });
        const req = createMockReq("POST", "/api/v1/auth/reset-password", {
            email: "test@example.com",
            verificationToken: "valid-vtoken",
            newPassword: "12345",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(400);
    });
});
describe("Email Auth — bind-email", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 5.1：手机号用户绑定邮箱
    it("should_bind_email_to_existing_phone_user", async () => {
        vi.mocked(verifyEmailVerificationToken).mockReturnValue({
            email: "user@example.com",
            purpose: "bind",
        });
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue(null); // 邮箱未被占用
        vi.mocked(appUserRepo.updateEmail).mockResolvedValue({
            id: "user-1",
            phone: "13800138000",
            email: "user@example.com",
            password_hash: "$2a$12$hashed",
            display_name: "Tester",
            avatar_url: null,
            created_at: "2026-04-04",
        });
        const req = createMockReq("POST", "/api/v1/auth/bind-email", {
            email: "user@example.com",
            verificationToken: "valid-vtoken",
        }, {
            authorization: "Bearer mock-access-token",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body.ok).toBe(true);
        expect(res._body.user.email).toBe("user@example.com");
    });
    // 场景 5.2：邮箱已被占用
    it("should_return_409_when_email_already_bound_to_other_user", async () => {
        vi.mocked(verifyEmailVerificationToken).mockReturnValue({
            email: "taken@example.com",
            purpose: "bind",
        });
        vi.mocked(appUserRepo.findByEmail).mockResolvedValue({
            id: "other-user",
            phone: null,
            email: "taken@example.com",
            password_hash: "hash",
            display_name: null,
            avatar_url: null,
            created_at: "2026-01-01",
        });
        const req = createMockReq("POST", "/api/v1/auth/bind-email", {
            email: "taken@example.com",
            verificationToken: "valid-vtoken",
        }, {
            authorization: "Bearer mock-access-token",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(409);
    });
});
describe("Email Auth — profile update", () => {
    let router;
    beforeEach(() => {
        vi.clearAllMocks();
        router = new Router();
        registerAuthRoutes(router);
    });
    // 场景 7.2：修改昵称
    it("should_update_display_name", async () => {
        vi.mocked(appUserRepo.updateProfile).mockResolvedValue({
            id: "user-1",
            phone: "13800138000",
            email: null,
            password_hash: "$2a$12$hashed",
            display_name: "小红",
            avatar_url: null,
            created_at: "2026-04-04",
        });
        const req = createMockReq("PATCH", "/api/v1/auth/profile", {
            displayName: "小红",
        }, {
            authorization: "Bearer mock-access-token",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body.user.displayName).toBe("小红");
    });
    // 昵称过长
    it("should_return_400_when_display_name_too_long", async () => {
        const req = createMockReq("PATCH", "/api/v1/auth/profile", {
            displayName: "a".repeat(21),
        }, {
            authorization: "Bearer mock-access-token",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(400);
    });
    // 场景 7.3：修改头像
    it("should_update_avatar_url", async () => {
        vi.mocked(appUserRepo.updateProfile).mockResolvedValue({
            id: "user-1",
            phone: "13800138000",
            email: null,
            password_hash: "$2a$12$hashed",
            display_name: "Tester",
            avatar_url: "https://cdn.example.com/avatar.jpg",
            created_at: "2026-04-04",
        });
        const req = createMockReq("PATCH", "/api/v1/auth/profile", {
            avatarUrl: "https://cdn.example.com/avatar.jpg",
        }, {
            authorization: "Bearer mock-access-token",
        });
        const res = createMockRes();
        await router.handle(req, res);
        expect(res._status).toBe(200);
        expect(res._body.user.avatarUrl).toBe("https://cdn.example.com/avatar.jpg");
    });
});
//# sourceMappingURL=auth-email.test.js.map