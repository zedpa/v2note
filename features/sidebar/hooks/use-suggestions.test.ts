/**
 * use-suggestions.ts 单元测试
 * Phase 15.3 — 建议 hook: fetch / accept / reject
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock api 模块
const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@/shared/lib/api", () => ({
  api: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

import { useSuggestions } from "./use-suggestions";

describe("useSuggestions — Phase 15.3", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should_fetch_suggestions_when_refresh_called", async () => {
    const mockSuggestions = [
      { id: "s1", suggestion_type: "split", payload: {}, status: "pending", created_at: "2026-04-12T00:00:00Z" },
    ];
    mockGet.mockResolvedValue({ suggestions: mockSuggestions });

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockGet).toHaveBeenCalledWith("/api/v1/wiki/suggestions");
    expect(result.current.suggestions).toEqual(mockSuggestions);
    expect(result.current.loading).toBe(false);
  });

  it("should_remove_suggestion_locally_when_accept_called", async () => {
    const mockSuggestions = [
      { id: "s1", suggestion_type: "split", payload: {}, status: "pending", created_at: "2026-04-12T00:00:00Z" },
      { id: "s2", suggestion_type: "merge", payload: {}, status: "pending", created_at: "2026-04-12T01:00:00Z" },
    ];
    mockGet.mockResolvedValue({ suggestions: mockSuggestions });
    mockPost.mockResolvedValue({});

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.suggestions).toHaveLength(2);

    await act(async () => {
      await result.current.accept("s1");
    });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/wiki/suggestions/s1/accept", {});
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].id).toBe("s2");
  });

  it("should_remove_suggestion_locally_when_reject_called", async () => {
    const mockSuggestions = [
      { id: "s1", suggestion_type: "split", payload: {}, status: "pending", created_at: "2026-04-12T00:00:00Z" },
    ];
    mockGet.mockResolvedValue({ suggestions: mockSuggestions });
    mockPost.mockResolvedValue({});

    const { result } = renderHook(() => useSuggestions());

    await act(async () => {
      await result.current.refresh();
    });

    await act(async () => {
      await result.current.reject("s1");
    });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/wiki/suggestions/s1/reject", {});
    expect(result.current.suggestions).toHaveLength(0);
  });

  it("should_set_loading_true_during_fetch", async () => {
    let resolvePromise: (value: any) => void;
    mockGet.mockReturnValue(new Promise((resolve) => { resolvePromise = resolve; }));

    const { result } = renderHook(() => useSuggestions());

    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    // loading 应为 true（正在请求中）
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePromise!({ suggestions: [] });
      await refreshPromise!;
    });

    expect(result.current.loading).toBe(false);
  });
});
