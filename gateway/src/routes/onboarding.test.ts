/**
 * regression: fix-onboarding-old-account
 * GET /api/v1/onboarding/status 端点测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock 依赖 ──────────────────────────────────────────

vi.mock("../db/repositories/user-profile.js", () => ({
  findByUser: vi.fn(),
}));

vi.mock("../handlers/onboarding.js", () => ({
  handleOnboardingChat: vi.fn(),
}));

vi.mock("../lib/http-helpers.js", () => ({
  sendJson: vi.fn(),
  sendError: vi.fn(),
  getUserId: vi.fn(() => "u-1"),
  readBody: vi.fn(),
}));

import { findByUser } from "../db/repositories/user-profile.js";
import { sendJson, sendError, getUserId } from "../lib/http-helpers.js";
import { registerOnboardingRoutes } from "./onboarding.js";

// ── 捕获注册的 handler ──────────────────────────────────

type Handler = (req: any, res: any, params: any, query: any) => Promise<void>;
const handlers = new Map<string, Handler>();

const fakeRouter = {
  get: vi.fn((path: string, h: Handler) => { handlers.set(`GET ${path}`, h); }),
  post: vi.fn((path: string, h: Handler) => { handlers.set(`POST ${path}`, h); }),
  patch: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

describe("GET /api/v1/onboarding/status", () => {
  // regression: fix-onboarding-old-account
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerOnboardingRoutes(fakeRouter as any);
  });

  it("should_return_done_true_when_onboarding_done_is_true", async () => {
    vi.mocked(findByUser).mockResolvedValue({
      onboarding_done: true,
    } as any);

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(findByUser).toHaveBeenCalledWith("u-1");
    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      { done: true },
    );
  });

  it("should_return_done_false_when_onboarding_done_is_false", async () => {
    vi.mocked(findByUser).mockResolvedValue({
      onboarding_done: false,
    } as any);

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      { done: false },
    );
  });

  it("should_return_done_false_when_no_profile_exists", async () => {
    vi.mocked(findByUser).mockResolvedValue(null);

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      { done: false },
    );
  });

  it("should_return_done_false_when_onboarding_done_is_null", async () => {
    // 早期用户，字段后加，值为 null
    vi.mocked(findByUser).mockResolvedValue({
      onboarding_done: null,
    } as any);

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(sendJson).toHaveBeenCalledWith(
      expect.anything(),
      { done: false },
    );
  });

  it("should_return_500_when_findByUser_throws", async () => {
    vi.mocked(findByUser).mockRejectedValue(new Error("DB connection failed"));

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(sendError).toHaveBeenCalledWith(
      expect.anything(),
      "Internal error",
      500,
    );
  });

  it("should_return_401_when_no_auth", async () => {
    vi.mocked(getUserId).mockReturnValue(null);

    const handler = handlers.get("GET /api/v1/onboarding/status")!;
    await handler({} as any, {} as any, {}, {});

    expect(sendError).toHaveBeenCalledWith(
      expect.anything(),
      "Unauthorized",
      401,
    );
    expect(findByUser).not.toHaveBeenCalled();
  });
});
