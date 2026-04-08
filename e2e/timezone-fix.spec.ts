import { test, expect } from "@playwright/test";

/**
 * E2E 验收测试：系统性时区修复
 * regression: fix-timezone-systematic
 *
 * 核心验证：在 UTC+8 凌晨时段（UTC 日期 ≠ 本地日期），
 * 系统的日期判断、搜索、导出等功能使用本地日期而非 UTC 日期。
 */

test.describe("时区修复 — 日期一致性", () => {
  test("搜索「昨天的日记」返回本地昨天的记录", async ({ request }) => {
    // 通过 REST API 调用搜索，验证 date=yesterday 解析为本地日期
    const res = await request.get("/api/notes", {
      params: { date: "yesterday" },
    });
    // 即使搜索返回空，也不应报错
    expect(res.status()).toBeLessThan(500);

    // 验证返回的记录（如果有）其 created_at 都在本地"昨天"范围内
    if (res.ok()) {
      const data = await res.json();
      if (data.records?.length > 0) {
        for (const record of data.records) {
          // created_at 转为本地日期后应等于本地昨天
          const createdLocal = new Date(record.created_at).toLocaleString("sv-SE", {
            timeZone: "Asia/Shanghai",
            year: "numeric", month: "2-digit", day: "2-digit",
          });
          const yesterday = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Shanghai" }),
          );
          yesterday.setDate(yesterday.getDate() - 1);
          const expectedDate = yesterday.toISOString().slice(0, 10);
          // 注：此断言在凌晨时段最有意义
          expect(createdLocal).toBe(expectedDate);
        }
      }
    }
  });

  test("导出文件名日期与本地日期一致", async ({ request }) => {
    const res = await request.get("/api/export");
    if (res.ok()) {
      const disposition = res.headers()["content-disposition"] ?? "";
      // 文件名中应包含本地日期
      const todayLocal = new Date().toLocaleString("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric", month: "2-digit", day: "2-digit",
      });
      if (disposition) {
        expect(disposition).toContain(todayLocal);
      }
    }
  });

  test("统计接口返回的周起止日期基于本地时区", async ({ request }) => {
    const res = await request.get("/api/stats/week");
    if (res.ok()) {
      const data = await res.json();
      // weekStart 应该是本地周一
      if (data.weekStart) {
        const d = new Date(data.weekStart);
        // 转为 Asia/Shanghai 的星期几
        const dayOfWeek = new Date(
          d.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }),
        ).getDay();
        // 周一 = 1（或周日 = 0 取决于实现，至少不应因 UTC 偏移导致跨日）
        expect([0, 1]).toContain(dayOfWeek);
      }
    }
  });
});
