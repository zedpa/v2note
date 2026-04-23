/**
 * use-virtual-list hook 单元测试
 * spec: native-experience-deep.md Phase D — 虚拟滚动
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// Mock @tanstack/react-virtual — 用具名 vi.fn 追踪调用
const mockMeasureElement = vi.fn();
const mockMeasure = vi.fn();
const mockUseVirtualizer = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (...args: any[]) => mockUseVirtualizer(...args),
}));

import { useVirtualList } from "./use-virtual-list";

function createParentRef() {
  const div = document.createElement("div");
  Object.defineProperty(div, "scrollHeight", { value: 1000, writable: true });
  Object.defineProperty(div, "clientHeight", { value: 500, writable: true });
  return { current: div };
}

/** 设置 mockUseVirtualizer 的默认实现 */
function setupDefaultMock() {
  mockUseVirtualizer.mockImplementation((opts: any) => {
    const count = opts.count;
    const estimateSize = opts.estimateSize(0);
    const overscan = opts.overscan ?? 3;

    // 模拟可见区域 items（假设视口可见 5 个）
    const visibleCount = Math.min(count, 5 + overscan * 2);
    const items = Array.from({ length: visibleCount }, (_, i) => ({
      index: i,
      start: i * estimateSize,
      size: estimateSize,
      end: (i + 1) * estimateSize,
      key: i,
    }));

    return {
      getVirtualItems: () => items,
      getTotalSize: () => count * estimateSize,
      measureElement: mockMeasureElement,
      measure: mockMeasure,
    };
  });
}

describe("useVirtualList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMock();
  });

  // 场景 2.1: 基本虚拟滚动 — 只渲染可视区域 + overscan 的 DOM 节点
  it("should_return_limited_virtual_items_when_list_has_200_items", () => {
    const parentRef = createParentRef();

    const { result } = renderHook(() =>
      useVirtualList({
        count: 200,
        estimateSize: 120,
        overscan: 3,
        parentRef,
      }),
    );

    // virtualItems 数量应远小于总数 200（5 可见 + 3*2 overscan = 11）
    expect(result.current.virtualItems.length).toBeLessThan(200);
    expect(result.current.virtualItems.length).toBe(11);
    // totalSize 应等于所有项的预估高度总和
    expect(result.current.totalSize).toBe(200 * 120);
  });

  // 场景 2.6: 动态高度 — measureElement 回调存在
  it("should_provide_measureElement_callback_for_dynamic_height", () => {
    const parentRef = createParentRef();

    const { result } = renderHook(() =>
      useVirtualList({
        count: 10,
        estimateSize: 120,
        parentRef,
      }),
    );

    expect(typeof result.current.measureElement).toBe("function");

    // 调用 measureElement 应传递给 virtualizer
    const mockNode = document.createElement("div");
    result.current.measureElement(mockNode);
    expect(mockMeasureElement).toHaveBeenCalledWith(mockNode);
  });

  // 场景 2.6: 首次渲染后缓存高度 — measureElement 传 null 时不调用
  it("should_not_call_virtualizer_measureElement_when_node_is_null", () => {
    const parentRef = createParentRef();

    const { result } = renderHook(() =>
      useVirtualList({
        count: 10,
        estimateSize: 120,
        parentRef,
      }),
    );

    result.current.measureElement(null);
    expect(mockMeasureElement).not.toHaveBeenCalled();
  });

  // 场景 2.7: 下拉刷新兼容 — remeasure 函数存在
  it("should_provide_remeasure_function_for_refresh_compatibility", () => {
    const parentRef = createParentRef();

    const { result } = renderHook(() =>
      useVirtualList({
        count: 10,
        estimateSize: 120,
        parentRef,
      }),
    );

    expect(typeof result.current.remeasure).toBe("function");
    result.current.remeasure();
    expect(mockMeasure).toHaveBeenCalledTimes(1);
  });

  // 场景 2.9: 空列表 — enabled=false 时不启用虚拟化
  it("should_return_empty_virtual_items_when_enabled_is_false", () => {
    const parentRef = createParentRef();

    const { result } = renderHook(() =>
      useVirtualList({
        count: 0,
        estimateSize: 120,
        parentRef,
        enabled: false,
      }),
    );

    // count=0 传给 useVirtualizer，返回空 items
    expect(result.current.virtualItems.length).toBe(0);
    expect(result.current.totalSize).toBe(0);
  });

  // overscan 默认值为 3
  it("should_use_default_overscan_of_3_when_not_specified", () => {
    const parentRef = createParentRef();

    renderHook(() =>
      useVirtualList({
        count: 50,
        estimateSize: 120,
        parentRef,
      }),
    );

    // 验证 useVirtualizer 被调用时 overscan 为 3
    const callArgs = mockUseVirtualizer.mock.calls[mockUseVirtualizer.mock.calls.length - 1][0];
    expect(callArgs.overscan).toBe(3);
  });

  // 自定义 overscan
  it("should_use_custom_overscan_when_specified", () => {
    const parentRef = createParentRef();

    renderHook(() =>
      useVirtualList({
        count: 50,
        estimateSize: 120,
        overscan: 5,
        parentRef,
      }),
    );

    const callArgs = mockUseVirtualizer.mock.calls[mockUseVirtualizer.mock.calls.length - 1][0];
    expect(callArgs.overscan).toBe(5);
  });

  // estimateSize 正确传递
  it("should_use_estimateSize_120_for_diary_cards", () => {
    const parentRef = createParentRef();

    renderHook(() =>
      useVirtualList({
        count: 100,
        estimateSize: 120,
        parentRef,
      }),
    );

    const callArgs = mockUseVirtualizer.mock.calls[mockUseVirtualizer.mock.calls.length - 1][0];
    // estimateSize 是一个函数，调用它应返回 120
    expect(callArgs.estimateSize(0)).toBe(120);
  });
});
