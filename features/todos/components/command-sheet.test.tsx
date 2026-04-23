import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState, useEffect, useRef } from "react";

// 测试 CommandSheet 的超时逻辑和 phase 状态转换
// 不需要完整渲染 CommandSheet UI（依赖 framer-motion 等），只测试核心逻辑

type SheetPhase = "transcribing" | "processing" | "result" | "detail" | "empty" | "error";

interface TodoCommand {
  action_type: string;
  confidence: number;
  [key: string]: any;
}

/**
 * 提取 CommandSheet 的核心 phase 状态机逻辑为可测试 hook
 */
function useCommandSheetPhase(opts: {
  open: boolean;
  commands?: TodoCommand[];
  transcript?: string;
  timeoutMs?: number;
}) {
  const [phase, setPhase] = useState<SheetPhase>("processing");
  const [errorMessage, setErrorMessage] = useState<string>("");

  // 根据 props 更新阶段
  useEffect(() => {
    if (!opts.open) {
      setPhase("processing");
      return;
    }
    if (opts.commands && opts.commands.length > 0) {
      const first = opts.commands[0];
      if (first?.action_type === "error") {
        setErrorMessage((first as any).error_message || "指令处理失败");
        setPhase("error");
      } else if (first?.action_type === "empty") {
        setPhase("empty");
      } else {
        setPhase("result");
      }
    } else if (opts.transcript) {
      setPhase("processing");
    }
  }, [opts.open, opts.commands, opts.transcript]);

  // 超时保护
  useEffect(() => {
    if (!opts.open || phase !== "processing") return;
    const timer = setTimeout(() => {
      setErrorMessage("指令处理超时，请重试");
      setPhase("error");
    }, opts.timeoutMs ?? 20000);
    return () => clearTimeout(timer);
  }, [opts.open, phase, opts.timeoutMs]);

  return { phase, errorMessage };
}

// ══════════════════════════════════════════════════════════════════════
// 场景 1.1: AI 分类返回空结果 → 显示"未识别到指令"
// ══════════════════════════════════════════════════════════════════════

describe("CommandSheet phase 状态机", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should_show_empty_phase_when_commands_contain_empty_marker", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: true,
        commands: [{ action_type: "empty", confidence: 0 }],
      })
    );
    expect(result.current.phase).toBe("empty");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 场景 1.2: AI 分类超时/失败 → 显示错误
  // ══════════════════════════════════════════════════════════════════════

  it("should_show_error_phase_when_commands_contain_error_marker", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: true,
        commands: [{ action_type: "error", confidence: 0, error_message: "指令执行失败" } as any],
      })
    );
    expect(result.current.phase).toBe("error");
    expect(result.current.errorMessage).toBe("指令执行失败");
  });

  it("should_show_default_error_message_when_error_has_no_message", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: true,
        commands: [{ action_type: "error", confidence: 0 }],
      })
    );
    expect(result.current.phase).toBe("error");
    expect(result.current.errorMessage).toBe("指令处理失败");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 场景 1.3: CommandSheet processing 超时保护
  // ══════════════════════════════════════════════════════════════════════

  it("should_switch_to_error_phase_after_timeout_when_still_processing", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: true,
        transcript: "test transcript",
        timeoutMs: 100, // 使用短超时便于测试
      })
    );

    expect(result.current.phase).toBe("processing");

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.phase).toBe("error");
    expect(result.current.errorMessage).toBe("指令处理超时，请重试");
  });

  it("should_not_timeout_when_result_arrives_before_timeout", () => {
    const { result, rerender } = renderHook(
      (props) => useCommandSheetPhase(props),
      {
        initialProps: {
          open: true,
          transcript: "test",
          timeoutMs: 200,
          commands: undefined as TodoCommand[] | undefined,
        },
      }
    );

    expect(result.current.phase).toBe("processing");

    // 在超时之前收到结果
    act(() => {
      vi.advanceTimersByTime(50);
    });

    rerender({
      open: true,
      transcript: "test",
      timeoutMs: 200,
      commands: [{ action_type: "create", confidence: 0.9 }],
    });

    expect(result.current.phase).toBe("result");

    // 继续等超时时间，不应再变成 error
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.phase).toBe("result");
  });

  it("should_not_timeout_when_sheet_is_closed", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: false,
        transcript: "test",
        timeoutMs: 100,
      })
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 关闭状态下不应该触发超时
    expect(result.current.phase).toBe("processing");
  });

  // ══════════════════════════════════════════════════════════════════════
  // 场景 4: 正常流程不受影响
  // ══════════════════════════════════════════════════════════════════════

  it("should_switch_to_result_phase_when_valid_commands_arrive", () => {
    const { result } = renderHook(() =>
      useCommandSheetPhase({
        open: true,
        commands: [{ action_type: "create", confidence: 0.95 }],
      })
    );
    expect(result.current.phase).toBe("result");
  });

  it("should_reset_to_processing_when_sheet_closes", () => {
    const { result, rerender } = renderHook(
      (props) => useCommandSheetPhase(props),
      {
        initialProps: {
          open: true,
          commands: [{ action_type: "create", confidence: 0.95 }] as TodoCommand[] | undefined,
        },
      }
    );

    expect(result.current.phase).toBe("result");

    rerender({ open: false, commands: undefined });

    expect(result.current.phase).toBe("processing");
  });
});

// ══════════════════════════════════════════════════════════════════════
// 场景 D3: 多条指令独立确认/拒绝按钮
// ══════════════════════════════════════════════════════════════════════

/**
 * 提取 CommandSheet 中多指令管理逻辑为可测试 hook
 * 模拟 editableCommands 状态 + handleConfirmSingle / handleDismissCommand
 */
function useCommandListManager(opts: {
  initialCommands: TodoCommand[];
  onConfirm: (commands: TodoCommand[]) => void;
  onClose: () => void;
}) {
  const [editableCommands, setEditableCommands] = useState<TodoCommand[]>(opts.initialCommands);

  // 同步 initialCommands 变化
  useEffect(() => {
    setEditableCommands([...opts.initialCommands]);
  }, [opts.initialCommands]);

  /** 单条确认：取出指令执行，从列表移除 */
  const handleConfirmSingle = (idx: number) => {
    const cmd = editableCommands[idx];
    if (!cmd) return;
    opts.onConfirm([cmd]);
    setEditableCommands((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) opts.onClose();
      return next;
    });
  };

  /** 移除单条指令（不执行） */
  const handleDismissCommand = (idx: number) => {
    setEditableCommands((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) opts.onClose();
      return next;
    });
  };

  /** 全部确认 */
  const handleConfirmAll = () => {
    opts.onConfirm(editableCommands);
  };

  const isMultiple = editableCommands.length > 1;

  return { editableCommands, handleConfirmSingle, handleDismissCommand, handleConfirmAll, isMultiple };
}

describe("D3: 多条指令独立确认/拒绝", () => {
  const twoCommands: TodoCommand[] = [
    { action_type: "create", confidence: 0.95, todo: { text: "开会" } } as any,
    { action_type: "create", confidence: 0.9, todo: { text: "交报告" } } as any,
  ];

  const singleCommand: TodoCommand[] = [
    { action_type: "create", confidence: 0.95, todo: { text: "开会" } } as any,
  ];

  it("should_show_individual_buttons_when_multiple_commands", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    expect(result.current.isMultiple).toBe(true);
    expect(result.current.editableCommands).toHaveLength(2);
  });

  it("should_not_show_individual_buttons_when_single_command", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: singleCommand, onConfirm, onClose })
    );

    expect(result.current.isMultiple).toBe(false);
  });

  it("should_confirm_single_command_and_remove_from_list_when_check_clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleConfirmSingle(0);
    });

    // onConfirm 被调用，传入单条指令数组
    expect(onConfirm).toHaveBeenCalledWith([twoCommands[0]]);
    // 列表只剩一条
    expect(result.current.editableCommands).toHaveLength(1);
    expect(result.current.editableCommands[0].todo?.text).toBe("交报告");
    // 弹窗不关闭（还有剩余）
    expect(onClose).not.toHaveBeenCalled();
  });

  it("should_dismiss_single_command_without_executing_when_x_clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleDismissCommand(0);
    });

    expect(onConfirm).not.toHaveBeenCalled();
    expect(result.current.editableCommands).toHaveLength(1);
    expect(result.current.editableCommands[0].todo?.text).toBe("交报告");
  });

  it("should_close_sheet_when_last_command_confirmed", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleConfirmSingle(0);
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      result.current.handleConfirmSingle(0);
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("should_close_sheet_when_last_command_dismissed", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleDismissCommand(0);
    });
    act(() => {
      result.current.handleDismissCommand(0);
    });

    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("should_confirm_all_remaining_commands_when_confirm_all_clicked", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleConfirmAll();
    });

    expect(onConfirm).toHaveBeenCalledWith(twoCommands);
  });

  it("should_confirm_all_remaining_after_partial_dismiss", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useCommandListManager({ initialCommands: twoCommands, onConfirm, onClose })
    );

    act(() => {
      result.current.handleDismissCommand(0);
    });

    act(() => {
      result.current.handleConfirmAll();
    });

    expect(onConfirm).toHaveBeenCalledWith([twoCommands[1]]);
  });
});
