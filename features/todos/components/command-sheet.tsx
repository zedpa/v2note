"use client";

/**
 * CommandSheet — 统一语音指令确认弹窗
 *
 * 三种模式：
 * 1. todo: 待办全能模式（create/complete/modify/query）
 * 2. agent: 全量 Agent 模式（工具执行状态流）
 * 3. action: Layer 3 识别到的 action（同 todo 模式展示）
 *
 * 交互设计要点：
 * - ASR 完成即弹出（零等待），AI 结果原地回填
 * - 底部"智能底座"：麦克风 + 继续说话 + 按钮组
 * - 待办卡片字段可点击直接修改
 * - 查询结果列表（最多 5 条 + 查看更多跳转）
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Check, Mic, ChevronLeft, Clock, Bell, Star, RotateCcw, Sparkles, Type, Send, User, Target, Timer } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────

export interface TodoCommand {
  action_type: "create" | "complete" | "modify" | "query";
  confidence: number;
  todo?: ExtractedTodo;
  target_hint?: string;
  target_id?: string;
  changes?: Partial<ExtractedTodo>;
  query_params?: { date?: string; goal_id?: string; status?: string };
  query_result?: Array<{ id: string; text: string; scheduled_start?: string; done: boolean; priority?: number }>;
}

export interface ExtractedTodo {
  text: string;
  scheduled_start?: string;
  scheduled_end?: string;
  estimated_minutes?: number;
  priority?: number;
  person?: string;
  goal_hint?: string | null;
  reminder?: {
    enabled: boolean;
    before_minutes: number;
    types: ("notification" | "alarm" | "calendar")[];
  };
  recurrence?: {
    rule: string;
    end_date?: string | null;
  };
}

type SheetPhase = "transcribing" | "processing" | "result" | "detail";

interface CommandSheetProps {
  open: boolean;
  onClose: () => void;
  transcript?: string;
  commands?: TodoCommand[];
  mode: "todo" | "agent" | "action";
  toolStatuses?: string[];           // Agent 模式下的工具状态流
  onConfirm: (commands: TodoCommand[]) => void;
  onCancel: () => void;
  onContinueSpeak?: () => void;      // 继续说话
  onTextSubmit?: (text: string) => void;  // 文字输入提交（继续修改）
  onViewMore?: (params: { date?: string; goal_id?: string }) => void;
}

// ── Priority 颜色映射 ──────────────────────────────────────────

const PRIORITY_CONFIG: Record<number, { color: string; label: string }> = {
  1: { color: "bg-blue-400", label: "低" },
  2: { color: "bg-blue-500", label: "较低" },
  3: { color: "bg-amber-500", label: "中" },
  4: { color: "bg-orange-500", label: "高" },
  5: { color: "bg-red-500", label: "紧急" },
};

// ── 时间格式化 ─────────────────────────────────────────────────

function formatSchedule(iso?: string): string {
  if (!iso) return "未设置";
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dateStr =
    d.toDateString() === now.toDateString() ? "今天" :
    d.toDateString() === tomorrow.toDateString() ? "明天" :
    `${d.getMonth() + 1}月${d.getDate()}日`;

  const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${dateStr} ${timeStr}`;
}

function formatRecurrence(rule?: string): string {
  if (!rule) return "";
  if (rule === "daily") return "每天";
  if (rule === "weekdays") return "工作日";
  if (rule.startsWith("weekly:")) {
    const days = rule.slice(7).split(",").map(Number);
    const names = ["日", "一", "二", "三", "四", "五", "六"];
    return `每周${days.map(d => names[d]).join("、")}`;
  }
  if (rule.startsWith("monthly:")) return `每月${rule.slice(8)}号`;
  return rule;
}

// ── 主组件 ─────────────────────────────────────────────────────

export function CommandSheet({
  open,
  onClose,
  transcript,
  commands,
  mode,
  toolStatuses = [],
  onConfirm,
  onCancel,
  onContinueSpeak,
  onTextSubmit,
  onViewMore,
}: CommandSheetProps) {
  const [phase, setPhase] = useState<SheetPhase>("processing");
  const [selectedDetail, setSelectedDetail] = useState<number | null>(null);
  const [editableCommands, setEditableCommands] = useState<TodoCommand[]>([]);
  const [textInputMode, setTextInputMode] = useState(false);
  const [textInputValue, setTextInputValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // 根据 props 更新阶段
  useEffect(() => {
    if (!open) {
      setPhase("processing");
      setSelectedDetail(null);
      return;
    }
    if (commands && commands.length > 0) {
      setEditableCommands([...commands]);
      setPhase("result");
    } else if (transcript) {
      setPhase("processing");
    }
  }, [open, commands, transcript]);

  const handleDismissCommand = useCallback((idx: number) => {
    setEditableCommands((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) onClose();
      return next;
    });
  }, [onClose]);

  const handleConfirmAll = useCallback(() => {
    onConfirm(editableCommands);
  }, [editableCommands, onConfirm]);

  if (!open) return null;

  return (
    <>
      {/* 遮罩 */}
      <motion.div
        className="fixed inset-0 z-50 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* 弹窗主体 */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-hidden rounded-t-3xl border-t border-white/10"
        style={{
          background: "rgba(28, 28, 30, 0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 300 }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: "calc(80vh - 60px)" }}>
          <AnimatePresence mode="wait">
            {phase === "processing" && (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -20 }}
                className="py-6"
              >
                {/* 转写文本 */}
                {transcript && (
                  <p className="mb-4 text-sm text-white/60 leading-relaxed">{transcript}</p>
                )}

                {/* Loading */}
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
                  <span className="text-white/80 text-sm">
                    {mode === "agent" ? "正在执行..." : "正在识别..."}
                  </span>
                </div>

                {/* Agent 模式：工具状态流 */}
                {mode === "agent" && toolStatuses.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {toolStatuses.map((status, i) => (
                      <div key={i} className="text-xs text-white/50">{status}</div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {phase === "result" && selectedDetail === null && (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {/* 标题 */}
                <div className="flex items-center gap-2.5 mb-5 mt-2">
                  <Sparkles className="h-[18px] w-[18px] text-indigo-400" style={{ textShadow: "0 0 10px rgba(94,92,230,0.4)" }} />
                  <span className="text-lg font-semibold text-white">
                    {editableCommands[0]?.action_type === "query"
                      ? editableCommands[0]?.query_params?.date
                        ? `${formatSchedule(editableCommands[0].query_params.date)}的安排`
                        : "查询结果"
                      : `识别到 ${editableCommands.length} 个指令`}
                  </span>
                  {editableCommands.length > 1 && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/50">
                      {editableCommands.length}项
                    </span>
                  )}
                </div>

                {/* 指令列表 */}
                <div className="space-y-2 mb-5">
                  {editableCommands.map((cmd, idx) => (
                    <CommandCard
                      key={idx}
                      command={cmd}
                      onTap={() => {
                        if (cmd.action_type === "create" || cmd.action_type === "modify") {
                          setSelectedDetail(idx);
                        }
                      }}
                      onDismiss={editableCommands.length > 1 ? () => handleDismissCommand(idx) : undefined}
                    />
                  ))}
                </div>

                {/* 查询结果 — 查看更多 */}
                {editableCommands[0]?.action_type === "query" &&
                  editableCommands[0]?.query_result &&
                  editableCommands[0].query_result.length >= 5 &&
                  onViewMore && (
                    <button
                      onClick={() => onViewMore(editableCommands[0].query_params ?? {})}
                      className="mb-4 w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/50 hover:bg-white/5"
                    >
                      查看更多 →
                    </button>
                  )}

                {/* 底部智能底座 */}
                <div className="flex items-center gap-3">
                  {textInputMode ? (
                    /* 文字输入模式 */
                    <div className="flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1"
                      style={{ boxShadow: "inset 0 0 0 1px rgba(94,92,230,0.3)" }}
                    >
                      <button
                        onClick={() => { setTextInputMode(false); setTextInputValue(""); }}
                        className="flex-shrink-0 p-1.5 rounded-full hover:bg-white/10"
                      >
                        <Mic className="h-4 w-4 text-indigo-400" />
                      </button>
                      <input
                        ref={textInputRef}
                        type="text"
                        value={textInputValue}
                        onChange={(e) => setTextInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && textInputValue.trim()) {
                            onTextSubmit?.(textInputValue.trim());
                            setTextInputValue("");
                            setTextInputMode(false);
                          }
                        }}
                        placeholder="输入修改指令..."
                        className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/30 py-1.5"
                        autoFocus
                      />
                      {textInputValue.trim() && (
                        <button
                          onClick={() => {
                            onTextSubmit?.(textInputValue.trim());
                            setTextInputValue("");
                            setTextInputMode(false);
                          }}
                          className="flex-shrink-0 p-1.5 rounded-full bg-indigo-500 hover:bg-indigo-400"
                        >
                          <Send className="h-3.5 w-3.5 text-white" />
                        </button>
                      )}
                    </div>
                  ) : (
                    /* 语音模式 — 点击区域可切换到文字 */
                    <button
                      onClick={() => {
                        if (onTextSubmit) {
                          setTextInputMode(true);
                          setTimeout(() => textInputRef.current?.focus(), 100);
                        } else {
                          onContinueSpeak?.();
                        }
                      }}
                      onContextMenu={(e) => {
                        // 长按触发语音（移动端通过 onContinueSpeak）
                        e.preventDefault();
                        onContinueSpeak?.();
                      }}
                      className="flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-2.5"
                      style={{ boxShadow: "inset 0 0 0 1px rgba(94,92,230,0.3)" }}
                    >
                      <Mic className="h-4 w-4 text-indigo-400 animate-pulse" />
                      <span className="text-xs text-white/40 truncate">继续说话修改...</span>
                      {onTextSubmit && (
                        <Type className="ml-auto h-3.5 w-3.5 text-white/30" />
                      )}
                    </button>
                  )}
                  {editableCommands[0]?.action_type !== "query" && (
                    <button
                      onClick={handleConfirmAll}
                      className="flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      确认
                    </button>
                  )}
                  {editableCommands[0]?.action_type === "query" && (
                    <button
                      onClick={onClose}
                      className="flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black"
                    >
                      知道了
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {phase === "result" && selectedDetail !== null && (
              <motion.div
                key="detail"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 30 }}
              >
                {/* 返回按钮 */}
                <button
                  onClick={() => setSelectedDetail(null)}
                  className="mb-4 mt-2 flex items-center gap-1 text-sm text-white/50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  返回
                </button>

                <TodoDetailEdit
                  todo={editableCommands[selectedDetail]?.todo}
                  onChange={(updated) => {
                    const newCmds = [...editableCommands];
                    if (newCmds[selectedDetail]) {
                      newCmds[selectedDetail] = { ...newCmds[selectedDetail], todo: updated };
                    }
                    setEditableCommands(newCmds);
                  }}
                />

                <button
                  onClick={() => setSelectedDetail(null)}
                  className="mt-5 w-full rounded-full bg-white py-3 text-sm font-medium text-black"
                >
                  完成编辑
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}

// ── 子组件：指令卡片 ──────────────────────────────────────────

function CommandCard({ command, onTap, onDismiss }: { command: TodoCommand; onTap: () => void; onDismiss?: () => void }) {
  const { action_type } = command;

  // 查询结果列表
  if (action_type === "query" && command.query_result) {
    return (
      <div className="space-y-1.5">
        {command.query_result.slice(0, 5).map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-transparent px-4 py-3 hover:bg-white/[0.06] hover:border-white/10 transition-all"
          >
            <div className="h-[18px] w-[18px] rounded-full border-[1.5px] border-white/30 flex-shrink-0" />
            <span className="text-[15px] font-semibold text-indigo-400 w-[45px]">
              {item.scheduled_start ? formatSchedule(item.scheduled_start).split(" ")[1] ?? "—" : "—"}
            </span>
            <span className="flex-1 text-[15px] text-white">{item.text}</span>
            {item.priority && item.priority >= 3 && (
              <div
                className={`h-2 w-2 rounded-full ${PRIORITY_CONFIG[item.priority]?.color ?? "bg-amber-500"}`}
                style={{ boxShadow: `0 0 8px ${item.priority >= 4 ? "#FF9F0A" : "#F59E0B"}` }}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  // 创建/修改待办卡片
  const todo = action_type === "modify" ? { ...command.todo, ...command.changes } as ExtractedTodo : command.todo;
  const actionLabel =
    action_type === "create" ? "创建" :
    action_type === "complete" ? "完成" :
    action_type === "modify" ? "修改" : "查询";
  const text = todo?.text ?? command.target_hint ?? "—";

  return (
    <button
      onClick={onTap}
      className="w-full flex items-center gap-3 rounded-xl bg-white/[0.03] border border-transparent px-4 py-3 hover:bg-white/[0.06] hover:border-white/10 text-left transition-all"
    >
      {/* 左侧 checkbox（完成类型显示不同样式） */}
      <div className={`h-[18px] w-[18px] rounded-full border-[1.5px] flex-shrink-0 ${
        action_type === "complete" ? "border-green-400 bg-green-400/20" : "border-white/30"
      }`}>
        {action_type === "complete" && <Check className="h-3 w-3 text-green-400 m-auto" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs text-indigo-400/70 font-medium">{actionLabel}</span>
          <span className="text-[15px] text-white truncate">{text}</span>
        </div>
        {/* 标签行 */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {todo?.scheduled_start && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/50">
              <Clock className="h-3 w-3" />
              {formatSchedule(todo.scheduled_start)}
            </span>
          )}
          {todo?.priority !== undefined && todo.priority !== 3 && (
            <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
              todo.priority >= 4
                ? "bg-red-500/15 text-red-400"
                : todo.priority >= 3
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-blue-500/15 text-blue-400"
            }`}>
              <Star className="h-3 w-3" />
              {PRIORITY_CONFIG[todo.priority]?.label ?? `P${todo.priority}`}
            </span>
          )}
          {todo?.reminder?.enabled && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-yellow-500/10 px-1.5 py-0.5 text-[11px] text-yellow-400/70">
              <Bell className="h-3 w-3" />
              提前{todo.reminder.before_minutes}分钟
            </span>
          )}
          {todo?.recurrence?.rule && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-green-500/10 px-1.5 py-0.5 text-[11px] text-green-400/70">
              <RotateCcw className="h-3 w-3" />
              {formatRecurrence(todo.recurrence.rule)}
            </span>
          )}
          {todo?.estimated_minutes && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/40">
              <Timer className="h-3 w-3" />
              {todo.estimated_minutes >= 60
                ? `${Math.floor(todo.estimated_minutes / 60)}h${todo.estimated_minutes % 60 ? `${todo.estimated_minutes % 60}m` : ""}`
                : `${todo.estimated_minutes}m`}
            </span>
          )}
          {todo?.person && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[11px] text-purple-400/70">
              <User className="h-3 w-3" />
              {todo.person}
            </span>
          )}
          {todo?.goal_hint && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-indigo-500/10 px-1.5 py-0.5 text-[11px] text-indigo-400/70">
              <Target className="h-3 w-3" />
              {todo.goal_hint}
            </span>
          )}
        </div>
      </div>

      {/* 优先级指示点 */}
      {todo?.priority && todo.priority >= 3 && (
        <div
          className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${PRIORITY_CONFIG[todo.priority]?.color ?? "bg-amber-500"}`}
          style={{ boxShadow: `0 0 8px ${todo.priority >= 4 ? "#FF9F0A" : "#F59E0B"}` }}
        />
      )}

      {/* 移除按钮 */}
      {onDismiss && (
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDismiss(); } }}
          className="ml-1 flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="h-3.5 w-3.5 text-white/30 hover:text-white/60" />
        </div>
      )}
    </button>
  );
}

// ── 子组件：待办详情编辑（弹窗内滑入） ────────────────────────

function TodoDetailEdit({
  todo,
  onChange,
}: {
  todo?: ExtractedTodo;
  onChange: (updated: ExtractedTodo) => void;
}) {
  if (!todo) return null;

  return (
    <div className="space-y-4">
      {/* 内容 */}
      <div>
        <label className="text-xs text-white/40 mb-1 block">待办内容</label>
        <input
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm outline-none focus:border-indigo-500"
          value={todo.text}
          onChange={(e) => onChange({ ...todo, text: e.target.value })}
        />
      </div>

      {/* 时间 */}
      <div>
        <label className="text-xs text-white/40 mb-1 block">
          <Clock className="inline h-3 w-3 mr-1" />时间
        </label>
        <input
          type="datetime-local"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white text-sm outline-none focus:border-indigo-500"
          value={todo.scheduled_start?.slice(0, 16) ?? ""}
          onChange={(e) => onChange({ ...todo, scheduled_start: e.target.value ? `${e.target.value}:00` : undefined })}
        />
      </div>

      {/* 优先级 */}
      <div>
        <label className="text-xs text-white/40 mb-1 block">
          <Star className="inline h-3 w-3 mr-1" />优先级
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((p) => (
            <button
              key={p}
              onClick={() => onChange({ ...todo, priority: p })}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                todo.priority === p
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              {PRIORITY_CONFIG[p]?.label ?? p}
            </button>
          ))}
        </div>
      </div>

      {/* 提醒 */}
      <div>
        <label className="text-xs text-white/40 mb-1 block">
          <Bell className="inline h-3 w-3 mr-1" />提醒
        </label>
        <div className="flex gap-2">
          {[0, 5, 15, 30, 60].map((mins) => (
            <button
              key={mins}
              onClick={() => {
                if (mins === 0) {
                  onChange({ ...todo, reminder: undefined });
                } else {
                  onChange({
                    ...todo,
                    reminder: {
                      enabled: true,
                      before_minutes: mins,
                      types: todo.reminder?.types ?? ["notification"],
                    },
                  });
                }
              }}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition-all ${
                (mins === 0 && !todo.reminder) || todo.reminder?.before_minutes === mins
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              {mins === 0 ? "不提醒" : `${mins}分钟前`}
            </button>
          ))}
        </div>
      </div>

      {/* 目标关联 */}
      {todo.goal_hint && (
        <div>
          <label className="text-xs text-white/40 mb-1 block">🎯 关联目标</label>
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-300">
            {todo.goal_hint}
          </div>
        </div>
      )}

      {/* 周期 */}
      {todo.recurrence?.rule && (
        <div>
          <label className="text-xs text-white/40 mb-1 block">
            <RotateCcw className="inline h-3 w-3 mr-1" />周期
          </label>
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70">
            {formatRecurrence(todo.recurrence.rule)}
          </div>
        </div>
      )}
    </div>
  );
}
