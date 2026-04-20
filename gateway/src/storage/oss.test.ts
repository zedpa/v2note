/**
 * OSS 签名缓存单元测试
 *
 * regression: fix-oss-image-traffic-storm
 * 锚点：spec 场景 1/2、行为 1/2 —— 同一 objectPath 在 TTL 内必须返回同一字符串
 *
 * 本测试是不可删除的回归锚。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ali-oss：每次 signatureUrl() 返回带随机 query 的 URL，模拟真实行为
vi.mock("ali-oss", () => {
  let counter = 0;
  class FakeOSS {
    signatureUrl(key: string, _opts: { expires: number }): string {
      counter += 1;
      return `https://fake.oss/${key}?Signature=sig${counter}&Expires=${Date.now() + 3600_000}`;
    }
  }
  return { default: FakeOSS };
});

describe("getSignedUrl [regression: fix-oss-image-traffic-storm]", () => {
  beforeEach(async () => {
    // 确保 env 都配好，否则 isOssConfigured=false 会短路
    process.env.OSS_REGION = "cn-shanghai";
    process.env.OSS_ACCESS_KEY_ID = "fake";
    process.env.OSS_ACCESS_KEY_SECRET = "fake";
    process.env.OSS_BUCKET = "fake";
    // 清缓存 + 重置模块状态
    const mod = await import("./oss.js");
    mod.__clearSignCacheForTest();
  });

  it("should_return_same_url_string_for_same_object_path_within_ttl", async () => {
    const { getSignedUrl } = await import("./oss.js");
    const a = await getSignedUrl("images/abc.jpg");
    const b = await getSignedUrl("images/abc.jpg");
    expect(a).toBe(b);
  });

  it("should_return_different_urls_for_different_paths", async () => {
    const { getSignedUrl } = await import("./oss.js");
    const a = await getSignedUrl("images/abc.jpg");
    const b = await getSignedUrl("images/xyz.jpg");
    expect(a).not.toBe(b);
  });

  it("should_normalize_http_url_to_object_key_and_hit_cache", async () => {
    const { getSignedUrl } = await import("./oss.js");
    const a = await getSignedUrl("images/abc.jpg");
    const b = await getSignedUrl("https://bucket.oss/images/abc.jpg");
    // 两种输入应归一化到同一 key，返回同一 URL
    expect(a).toBe(b);
  });

  it("should_refresh_signature_when_cache_expires", async () => {
    const { getSignedUrl, __clearSignCacheForTest } = await import("./oss.js");
    const a = await getSignedUrl("images/abc.jpg");
    __clearSignCacheForTest();
    const b = await getSignedUrl("images/abc.jpg");
    // 清缓存后是新一次签名（我们的 fake 每次 counter++）
    expect(a).not.toBe(b);
  });
});
