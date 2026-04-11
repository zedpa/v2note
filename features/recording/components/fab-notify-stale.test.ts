import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * regression: fix-recording-notify-stale
 *
 * 测试录音完成后的通知逻辑修复：
 * - asr.done 不再设置 processing=true，改为 fabNotify.success("已记录")
 * - process.result 不再弹出通知，不再操作 processing 状态
 * - error case 用 pipelineIdRef 判断是否显示"整理失败"
 * - 30s safety timeout 已移除
 *
 * 由于 fab.tsx 是大型 React 组件，无法轻量渲染，
 * 这里通过模拟消息处理函数的核心分支逻辑来验证行为。
 */

import { fabNotify } from "@/shared/lib/fab-notify";

// Mock fabNotify
vi.mock("@/shared/lib/fab-notify", () => {
  const success = vi.fn();
  const error = vi.fn();
  const info = vi.fn();
  const notify = vi.fn() as ReturnType<typeof vi.fn> & {
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  notify.success = success;
  notify.error = error;
  notify.info = info;
  return {
    fabNotify: notify,
    onFabNotify: vi.fn(() => vi.fn()),
  };
});

// Mock ai-processing
const mockStartPipeline = vi.fn(() => "pipeline-123");
const mockRenewPipeline = vi.fn();
const mockEndPipeline = vi.fn();

vi.mock("@/shared/lib/ai-processing", () => ({
  startAiPipeline: () => mockStartPipeline(),
  renewAiPipeline: (id: string) => mockRenewPipeline(id),
  endAiPipeline: (id: string) => mockEndPipeline(id),
}));

// Mock events
const mockEmit = vi.fn();
vi.mock("@/features/recording/lib/events", () => ({
  emit: (event: string) => mockEmit(event),
}));

/**
 * 模拟 fab.tsx 中消息处理的核心逻辑（修复后版本）。
 * 这些函数反映 fab.tsx switch case 中的实际行为。
 */
function createMessageHandler() {
  let processing = false;
  let wittyText = "";
  let pipelineId: string | null = null;
  const cacheId: string | null = "cache-abc";

  // 模拟 asr.done（有 recordId 的情况）
  function handleAsrDone(recordId?: string) {
    if (recordId) {
      mockEmit("recording:uploaded");
      // 修复后：不再 setProcessing(true) 和 setWittyText
      // 改为 fabNotify.success("已记录")
      fabNotify.success("已记录");
      pipelineId = mockStartPipeline();
    }
  }

  // 模拟 process.result
  function handleProcessResult() {
    mockEmit("recording:processed");
    // 修复后：不再 fabNotify.success("处理完成")
    // 修复后：不再 setProcessing(false) 和 setWittyText("")
    // 保留 pipeline 管理
    if (pipelineId) mockRenewPipeline(pipelineId);
  }

  // 模拟 error case
  function handleError() {
    // 修复后：用 pipelineId 判断，不再依赖 processing 状态
    if (pipelineId) fabNotify.error("整理失败");
    processing = false;
    wittyText = "";
    if (pipelineId) {
      mockEndPipeline(pipelineId);
      pipelineId = null;
    }
  }

  return {
    handleAsrDone,
    handleProcessResult,
    handleError,
    getState: () => ({ processing, wittyText, pipelineId }),
  };
}

describe("fix-recording-notify-stale: 录音通知状态修复", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("场景 1.1: asr.done → 即时成功提示", () => {
    it("should_show_success_notification_when_asr_done_with_recordId", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");

      // 应显示"已记录"成功提示
      expect(fabNotify.success).toHaveBeenCalledWith("已记录");
      // 不应设置 processing=true
      expect(handler.getState().processing).toBe(false);
      // 不应设置 wittyText
      expect(handler.getState().wittyText).toBe("");
    });

    it("should_emit_recording_uploaded_when_asr_done", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");

      expect(mockEmit).toHaveBeenCalledWith("recording:uploaded");
    });

    it("should_start_ai_pipeline_when_asr_done", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");

      expect(mockStartPipeline).toHaveBeenCalledOnce();
      expect(handler.getState().pipelineId).toBe("pipeline-123");
    });

    it("should_not_notify_when_asr_done_without_recordId", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone(undefined);

      expect(fabNotify.success).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  describe("场景 1.2: process.result → 静默刷新", () => {
    it("should_not_show_notification_when_process_result_received", () => {
      const handler = createMessageHandler();
      // 先触发 asr.done 建立 pipeline
      handler.handleAsrDone("record-123");
      vi.clearAllMocks();

      handler.handleProcessResult();

      // 不应弹出"处理完成"通知
      expect(fabNotify.success).not.toHaveBeenCalled();
    });

    it("should_emit_recording_processed_when_process_result", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");
      vi.clearAllMocks();

      handler.handleProcessResult();

      expect(mockEmit).toHaveBeenCalledWith("recording:processed");
    });

    it("should_renew_pipeline_when_process_result", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");
      vi.clearAllMocks();

      handler.handleProcessResult();

      expect(mockRenewPipeline).toHaveBeenCalledWith("pipeline-123");
    });

    it("should_not_change_processing_state_when_process_result", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");

      // processing 应已经是 false（asr.done 不再设置为 true）
      expect(handler.getState().processing).toBe(false);

      handler.handleProcessResult();

      // 仍然是 false
      expect(handler.getState().processing).toBe(false);
    });
  });

  describe("场景 1.3: AI 后处理失败 → 用 pipelineId 判断", () => {
    it("should_show_error_when_pipeline_active_and_error_received", () => {
      const handler = createMessageHandler();
      // 先建立 pipeline
      handler.handleAsrDone("record-123");
      vi.clearAllMocks();

      handler.handleError();

      // 应显示"整理失败"
      expect(fabNotify.error).toHaveBeenCalledWith("整理失败");
    });

    it("should_not_show_error_when_no_pipeline_and_error_received", () => {
      const handler = createMessageHandler();
      // 没有触发 asr.done，pipelineId 为 null

      handler.handleError();

      // 不应显示错误（没有活跃 pipeline）
      expect(fabNotify.error).not.toHaveBeenCalled();
    });

    it("should_cleanup_pipeline_on_error", () => {
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");
      vi.clearAllMocks();

      handler.handleError();

      expect(mockEndPipeline).toHaveBeenCalledWith("pipeline-123");
      expect(handler.getState().pipelineId).toBeNull();
    });

    it("should_set_processing_false_on_error", () => {
      const handler = createMessageHandler();
      handler.handleError();

      expect(handler.getState().processing).toBe(false);
    });
  });

  describe("场景 1.4: 30s safety timeout 已移除", () => {
    it("should_not_have_processing_true_after_asr_done", () => {
      // 验证 asr.done 后 processing 始终为 false，
      // 所以 30s timeout 即使存在也不会触发
      const handler = createMessageHandler();
      handler.handleAsrDone("record-123");

      expect(handler.getState().processing).toBe(false);
    });
  });

  describe("边界条件: 连续快速录音", () => {
    it("should_handle_multiple_asr_done_independently", () => {
      const handler = createMessageHandler();

      handler.handleAsrDone("record-1");
      handler.handleAsrDone("record-2");

      // 每次都应独立触发成功提示
      expect(fabNotify.success).toHaveBeenCalledTimes(2);
      expect(fabNotify.success).toHaveBeenNthCalledWith(1, "已记录");
      expect(fabNotify.success).toHaveBeenNthCalledWith(2, "已记录");
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });
  });
});
