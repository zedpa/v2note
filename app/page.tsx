"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { initStatusBar } from "@/shared/lib/status-bar";
import { WorkspaceHeader, type WorkspaceTab, type TodoViewMode } from "@/features/workspace/components/workspace-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
import { TodoWorkspace } from "@/features/todos/components/todo-workspace";
import { FAB } from "@/features/recording/components/fab";
import { CommandSheet, type TodoCommand } from "@/features/todos/components/command-sheet";
import { emit } from "@/features/recording/lib/events";
import { api } from "@/shared/lib/api";
import { getLocalToday, toLocalDateStr } from "@/features/todos/lib/date-utils";
import { SidebarDrawer } from "@/features/sidebar/components/sidebar-drawer";
import { SuggestionList } from "@/features/sidebar/components/suggestion-list";
import { useSuggestions } from "@/features/sidebar/hooks/use-suggestions";
import dynamic from 'next/dynamic';
import { OfflineBanner } from "@/shared/components/offline-banner";
import { fabNotify } from "@/shared/lib/fab-notify";
import { CoachMark } from "@/components/coach-mark";

// Overlay 组件懒加载 — 非首屏可见，按需加载减少首屏 bundle
const SearchView = dynamic(() => import('@/features/search/components/search-view').then(m => ({ default: m.SearchView })));
const ChatView = dynamic(() => import('@/features/chat/components/chat-view').then(m => ({ default: m.ChatView })));
const ReviewOverlay = dynamic(() => import('@/features/reviews/components/review-overlay').then(m => ({ default: m.ReviewOverlay })));
const ProfileEditor = dynamic(() => import('@/features/profile/components/profile-editor').then(m => ({ default: m.ProfileEditor })));
const SettingsEditor = dynamic(() => import('@/features/settings/components/settings-editor').then(m => ({ default: m.SettingsEditor })));
const NotebookList = dynamic(() => import('@/features/diary/components/notebook-list').then(m => ({ default: m.NotebookList })));
const MorningBriefing = dynamic(() => import('@/features/daily/components/morning-briefing').then(m => ({ default: m.MorningBriefing })));
const EveningSummary = dynamic(() => import('@/features/daily/components/evening-summary').then(m => ({ default: m.EveningSummary })));
const SmartDailyReport = dynamic(() => import('@/features/daily/components/smart-daily-report').then(m => ({ default: m.SmartDailyReport })));
const OnboardingSeed = dynamic(() => import('@/features/cognitive/components/onboarding-seed').then(m => ({ default: m.OnboardingSeed })));
const GoalDetailOverlay = dynamic(() => import('@/features/goals/components/goal-detail-overlay').then(m => ({ default: m.GoalDetailOverlay })));
const ProjectDetailOverlay = dynamic(() => import('@/features/goals/components/project-detail-overlay').then(m => ({ default: m.ProjectDetailOverlay })));
const GoalList = dynamic(() => import('@/features/goals/components/goal-list').then(m => ({ default: m.GoalList })));
const NotificationCenter = dynamic(() => import('@/features/notifications/components/notification-center').then(m => ({ default: m.NotificationCenter })));
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { createTodo, updateTodo, deleteTodo } from "@/shared/lib/api/todos";
import { getSettings, setCurrentUserId } from "@/shared/lib/local-config";
import {
  scheduleDailyNotifications,
  cancelDailyNotifications,
  addNotificationClickListener,
  addForegroundNotificationSuppressor,
  requestNotificationPermission,
} from "@/shared/lib/notifications";
import { dispatchIntents, type ReminderType } from "@/shared/lib/intent-dispatch";
import SystemIntent from "@/shared/lib/system-intent";
import { showUndoToast } from "@/features/todos/hooks/use-undo-toast";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { on } from "@/features/recording/lib/events";
import { useBackHandler } from "@/shared/hooks/use-back-handler";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/components/login-page";
import { RegisterPage } from "@/features/auth/components/register-page";
import { ForgotPassword } from "@/features/auth/components/forgot-password";
import { UserSettings } from "@/features/auth/components/user-settings";
import { useUpdateCheck } from "@/shared/hooks/use-update-check";
import { UpdateDialog } from "@/shared/components/update-dialog";
import type { AppNotification } from "@/features/notifications/hooks/use-notifications";
import { AnimatePresence } from "framer-motion";
import { OverlayTransition } from "@/shared/components/overlay-transition";
import { usePullToRefresh } from "@/shared/hooks/use-pull-to-refresh";
import { PullRefreshIndicator } from "@/components/ui/pull-refresh-indicator";

type OverlayName =
  | "search"
  | "chat"
  | "review"
  | "profile"
  | "settings"
  | "user-settings"
  | "notebooks"
  | "morning-briefing"
  | "evening-summary"
  | "daily-report"
  | "goals"
  | "goal-detail"
  | "project-detail"
  | "notifications"
  | null;

export default function Page() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { loggedIn, user, loading: authLoading, error: authError, login, loginEmail, register, registerEmail, logout, clearError } = useAuth();
  const { update, dismiss, applying } = useUpdateCheck();
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot-password">("login");
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatMode, setChatMode] = useState<"review" | "command" | "insight">("review");
  const [chatSkill, setChatSkill] = useState<string | undefined>();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [wikiPageFilter, setWikiPageFilter] = useState<string | null>(null);

  // ── Wiki 侧边栏数据：wiki page tree + inbox count ──
  interface SidebarPage {
    id: string;
    title: string;
    level: number;
    parentId: string | null;
    createdBy: string;
    pageType: string;
    recordCount: number;
    activeGoals: { id: string; title: string }[];
    updatedAt: string;
  }
  const [sidebarPages, setSidebarPages] = useState<SidebarPage[]>([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { suggestions, accept: acceptSuggestion, reject: rejectSuggestion, refresh: refreshSuggestions } = useSuggestions();
  const fetchSidebar = useCallback(() => {
    api.get<{ pages: SidebarPage[]; inboxCount: number; pendingSuggestionCount: number }>("/api/v1/wiki/sidebar")
      .then((res) => {
        setSidebarPages(res.pages ?? []);
        setInboxCount(res.inboxCount ?? 0);
        setPendingSuggestionCount(res.pendingSuggestionCount ?? 0);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    fetchSidebar();
    let delayTimer: ReturnType<typeof setTimeout>;
    const unsub = on("recording:processed", () => {
      fetchSidebar();
      clearTimeout(delayTimer);
      delayTimer = setTimeout(fetchSidebar, 8000);
    });
    return () => { unsub(); clearTimeout(delayTimer); };
  }, [loggedIn, fetchSidebar]);
  // CommandSheet 状态（语音指令确认弹窗）
  const [commandSheetOpen, setCommandSheetOpen] = useState(false);
  const [commandSheetTranscript, setCommandSheetTranscript] = useState<string>("");
  const [commandSheetCommands, setCommandSheetCommands] = useState<TodoCommand[]>([]);
  const [commandSheetMode, setCommandSheetMode] = useState<"todo" | "agent" | "action">("todo");
  const [commandToolStatuses, setCommandToolStatuses] = useState<string[]>([]);

  // Workspace: Segment tab (日记 | 待办)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window === "undefined") return "diary";
    return (localStorage.getItem("v2note:activeTab") as WorkspaceTab) || "diary";
  });

  const [todoViewMode, setTodoViewMode] = useState<TodoViewMode>("time");

  // 持久化 tab 选择
  useEffect(() => {
    localStorage.setItem("v2note:activeTab", activeTab);
  }, [activeTab]);

  /** null = voice notes timeline, string = diary notebook name */
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);

  // ── 下拉刷新 ──
  const mainScrollRef = useRef<HTMLElement>(null);
  const diaryRefreshRef = useRef<() => Promise<boolean>>(undefined);
  const todoRefreshRef = useRef<() => Promise<boolean>>(undefined);
  const [fabRecording, setFabRecording] = useState(false);

  const handlePullRefresh = useCallback(async (): Promise<boolean> => {
    const fn = activeTab === "diary" ? diaryRefreshRef.current : todoRefreshRef.current;
    if (!fn) return true;
    return fn();
  }, [activeTab]);
  const pullToRefresh = usePullToRefresh({
    onRefresh: handlePullRefresh,
    scrollRef: mainScrollRef,
    disabled: fabRecording,
  });

  // ── Settings 按用户隔离 ──
  useEffect(() => {
    setCurrentUserId(loggedIn && user?.id ? user.id : null);
  }, [loggedIn, user?.id]);

  // Onboarding state — 按用户维度判断，旧设备新用户也能触发冷启动
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  useEffect(() => {
    if (!loggedIn || !user?.id) return;
    const key = `v2note:onboarded:${user.id}`;

    // 1. 新格式 key 已标记 → 跳过
    if (localStorage.getItem(key) === "true") {
      if (localStorage.getItem(`v2note:guide-done:${user.id}`) !== "true") {
        setShowGuide(true);
      }
      return;
    }

    // 2. 旧格式 key 兼容（代码升级前的标记）→ 迁移并跳过
    if (localStorage.getItem("v2note:onboarded") === "true") {
      localStorage.setItem(key, "true");
      return;
    }

    // 3. localStorage 无记录 → 后端兜底：检查是否有历史数据
    api.get<{ records: any[] }>("/api/v1/records?limit=1")
      .then((res) => {
        if (res?.records?.length > 0) {
          // 老用户有数据，标记为已引导
          localStorage.setItem(key, "true");
        } else {
          // 真正的新用户
          setIsFirstTime(true);
        }
      })
      .catch(() => {
        // 网络失败 → 安全 fallback: 显示引导（不会伤害新用户体验）
        setIsFirstTime(true);
      });
  }, [loggedIn, user?.id]);

  useEffect(() => {
    initStatusBar();
  }, []);

  // ── 日报定时自动弹出（时间从 settings 读取） ──
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    getSettings().then((s) => {
      if (cancelled) return;
      const now = new Date();
      const hour = now.getHours();
      const today = toLocalDateStr(now);
      const morningH = s.morningBriefingHour ?? 6;
      const eveningH = s.eveningSummaryHour ?? 22;

      if (hour >= morningH && hour < morningH + 8) {
        // 早报时段：morningH ~ morningH+8
        const key = `v2note:morning_shown:${today}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          setActiveOverlay("morning-briefing");
        }
      } else if (hour >= eveningH || hour < 4) {
        // 晚报时段：eveningH ~ 次日4:00
        const eveningDate = hour < 4
          ? toLocalDateStr(new Date(now.getTime() - 86400000))
          : today;
        const key = `v2note:evening_shown:${eveningDate}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          setActiveOverlay("evening-summary");
        }
      }
    });
    return () => { cancelled = true; };
  }, [loggedIn]);

  // ── 本地通知调度 + 点击跳转 + 前台抑制 ──
  useEffect(() => {
    if (!loggedIn) return;
    let removeListener: (() => void) | undefined;
    let removeSuppressor: (() => void) | undefined;

    (async () => {
      const s = await getSettings();
      // 调度通知（仅 native 生效）
      if (s.dailyNotifications) {
        const granted = await requestNotificationPermission();
        if (granted) {
          await scheduleDailyNotifications({
            morningHour: s.morningBriefingHour ?? 6,
            eveningHour: s.eveningSummaryHour ?? 22,
            userName: user?.displayName ?? undefined,
          });
        }
      } else {
        await cancelDailyNotifications();
      }

      // 前台通知抑制：App 在前台时不弹出本地通知（避免与 WebSocket toast 双响）
      removeSuppressor = await addForegroundNotificationSuppressor();

      // 监听通知点击 → 打开日报 或 跳转待办
      removeListener = await addNotificationClickListener((action) => {
        if (action === "morning-briefing") {
          setActiveOverlay("morning-briefing");
        } else if (action === "evening-summary") {
          setActiveOverlay("evening-summary");
        } else if (action === "todo-reminder") {
          // 点击待办提醒通知 → 切换到待办 Tab
          setActiveTab("todo");
        }
      });
    })();

    return () => {
      removeListener?.();
      removeSuppressor?.();
    };
  }, [loggedIn, user?.displayName]);

  // ── CommandSheet: 用 ref 避免闭包捕获过期值 ──
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const activeOverlayRef = useRef(activeOverlay);
  activeOverlayRef.current = activeOverlay;
  const commandSheetOpenRef = useRef(commandSheetOpen);
  commandSheetOpenRef.current = commandSheetOpen;

  // ── 上滑 forceCommand：统一走 CommandSheet 弹窗 ──
  useEffect(() => {
    const handler = (e: Event) => {
      const transcript = (e as CustomEvent).detail?.transcript || "";
      setCommandSheetTranscript(transcript);
      setCommandSheetCommands([]);
      setCommandToolStatuses([]);
      setCommandSheetMode("todo");
      setCommandSheetOpen(true);
    };
    window.addEventListener("v2note:forceCommand", handler);
    return () => window.removeEventListener("v2note:forceCommand", handler);
  }, []);

  // ── CommandSheet: 监听 gateway 消息，驱动语音指令弹窗 ──
  useEffect(() => {
    if (!loggedIn) return;
    const client = getGatewayClient();

    const unsub = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        // 1) ASR 转写完成 → 仅待办页零等待弹出 CommandSheet
        case "asr.done": {
          const transcript = (msg.payload.transcript || "").trim();
          if (!transcript) break;
          console.log("[CommandSheet] asr.done received, activeTab:", activeTabRef.current, "overlay:", activeOverlayRef.current, "transcript:", transcript.slice(0, 30));
          // 只在待办页 (sourceContext="todo") 时立即弹出，日记页由 process.result 决定
          if (activeTabRef.current === "todo" && !activeOverlayRef.current) {
            setCommandSheetTranscript(transcript);
            setCommandSheetCommands([]);
            setCommandToolStatuses([]);
            setCommandSheetMode("todo");
            setCommandSheetOpen(true);
          }
          break;
        }

        // 2) process.result — AI 识别结果回填
        case "process.result": {
          const payload = msg.payload as Record<string, unknown>;
          console.log("[CommandSheet] process.result received, todo_commands:", !!(payload.todo_commands), "action_results:", !!(payload.action_results), "sheetOpen:", commandSheetOpenRef.current);

          // Layer 1: todo_commands
          if (payload.todo_commands && Array.isArray(payload.todo_commands)) {
            const cmds = payload.todo_commands as TodoCommand[];

            // 静默执行模式：confirm_before_execute=false 时跳过弹窗
            getSettings().then((settings) => {
              if (!settings.confirm_before_execute) {
                silentExecuteCommands(cmds);
              } else {
                setCommandSheetCommands(cmds);
                setCommandSheetMode("todo");
                if (!commandSheetOpenRef.current) {
                  setCommandSheetTranscript((payload as any).original_text || "");
                  setCommandSheetOpen(true);
                }
              }
            });
            break;
          }

          // Layer 2/3: action_results（voice_intent_type === "action"）
          if (payload.action_results && Array.isArray(payload.action_results)) {
            // ActionExecResult → TodoCommand 字段映射
            const ACTION_MAP: Record<string, TodoCommand["action_type"]> = {
              query_todo: "query", create_todo: "create",
              complete_todo: "complete", modify_todo: "modify",
            };
            const cmds = (payload.action_results as any[]).map((r): TodoCommand => ({
              action_type: ACTION_MAP[r.action] ?? r.action_type ?? r.action,
              confidence: r.confidence ?? 1,
              target_id: r.todo_id,
              target_hint: r.target_hint,
              changes: r.changes,
              query_params: r.query_params,
              query_result: r.items,  // ActionExecResult.items → TodoCommand.query_result
              todo: r.todo,
            }));

            getSettings().then((settings) => {
              if (!settings.confirm_before_execute) {
                silentExecuteCommands(cmds);
              } else {
                setCommandSheetCommands(cmds);
                setCommandSheetMode("action");
                if (!commandSheetOpenRef.current) {
                  setCommandSheetTranscript((payload as any).original_text || "");
                  setCommandSheetOpen(true);
                }
              }
            });
            break;
          }

          // 兜底：CommandSheet 已打开但没有匹配的 commands
          if (commandSheetOpenRef.current) {
            const error = (payload as any).error;
            if (error) {
              // 传递错误给 CommandSheet
              setCommandSheetCommands([{ action_type: "error" as any, error_message: error, confidence: 0 } as any]);
            } else {
              // 无 commands 也无 error → 空结果
              setCommandSheetCommands([{ action_type: "empty" as any, confidence: 0 } as any]);
            }
          } else {
            // 静默模式或 CommandSheet 未打开 → 通知用户
            const error = (payload as any).error;
            if (error) {
              fabNotify.info(error);
            } else {
              fabNotify.info("未识别到指令");
            }
          }
          break;
        }

        // 3) tool.status — 工具执行状态流（chat 流或 agent 模式）
        case "tool.status" as string: {
          const { label } = (msg as any).payload;
          if (commandSheetOpenRef.current) {
            setCommandToolStatuses((prev) => [...prev, label]);
            setCommandSheetMode("agent");
          }
          break;
        }
      }
    });

    return () => unsub();
  }, [loggedIn]);

  // 触发日历/闹钟 Intent（如果 reminder_types 包含 calendar/alarm）
  const triggerIntentDispatch = useCallback(async (cmd: TodoCommand) => {
    const source = cmd.action_type === "modify"
      ? { ...cmd.todo, ...cmd.changes }
      : cmd.todo;
    if (!source) return;
    const types = source.reminder?.types as ReminderType[] | undefined;
    if (!types || (!types.includes("calendar") && !types.includes("alarm"))) return;
    if (!source.scheduled_start) return;
    try {
      await dispatchIntents(
        {
          text: source.text ?? "",
          scheduled_start: source.scheduled_start,
          scheduled_end: source.scheduled_end ?? null,
          estimated_minutes: source.estimated_minutes ?? null,
          reminder_before: source.reminder?.before_minutes ?? null,
        },
        types,
        SystemIntent,
      );
    } catch (e) {
      console.warn("[intent-dispatch] failed:", e);
    }
  }, []);

  // CommandSheet 确认执行：根据指令类型调用 REST API
  const handleCommandConfirm = useCallback(async (commands: TodoCommand[]) => {
    setCommandSheetOpen(false);
    try {
      for (const cmd of commands) {
        switch (cmd.action_type) {
          case "create": {
            if (!cmd.todo?.text) break;
            await createTodo({
              text: cmd.todo.text,
              scheduled_start: cmd.todo.scheduled_start,
              estimated_minutes: cmd.todo.estimated_minutes,
              priority: cmd.todo.priority,
              goal_id: (cmd.todo as any)._matched_goal_id,
              reminder_before: cmd.todo.reminder?.before_minutes,
              reminder_types: cmd.todo.reminder?.types,
              recurrence_rule: cmd.todo.recurrence?.rule,
              recurrence_end: cmd.todo.recurrence?.end_date,
            });
            await triggerIntentDispatch(cmd);
            break;
          }
          case "complete": {
            if (!cmd.target_id) break;
            await updateTodo(cmd.target_id, { done: true });
            break;
          }
          case "modify": {
            if (!cmd.target_id || !cmd.changes) break;
            await updateTodo(cmd.target_id, {
              text: cmd.changes.text,
              scheduled_start: cmd.changes.scheduled_start,
              estimated_minutes: cmd.changes.estimated_minutes,
              priority: cmd.changes.priority,
              reminder_before: cmd.changes.reminder?.before_minutes,
              reminder_types: cmd.changes.reminder?.types,
              recurrence_rule: cmd.changes.recurrence?.rule,
              recurrence_end: cmd.changes.recurrence?.end_date,
            });
            await triggerIntentDispatch(cmd);
            break;
          }
          case "query":
            // 查询结果已展示在 CommandSheet 中，无需额外操作
            break;
        }
      }
      emit("recording:processed");
      fabNotify.success("指令已执行");
    } catch (err: any) {
      console.error("[CommandSheet] confirm error:", err);
      fabNotify.error("执行失败: " + (err.message || "未知错误"));
    }
  }, [triggerIntentDispatch]);

  // 静默执行：跳过 CommandSheet 直接执行 + 撤销 toast
  const silentExecuteCommands = useCallback(async (commands: TodoCommand[]) => {
    const createdIds: string[] = [];
    const completedIds: string[] = [];
    const modifiedEntries: Array<{ id: string; original: Record<string, unknown> }> = [];

    try {
      for (const cmd of commands) {
        switch (cmd.action_type) {
          case "create": {
            if (!cmd.todo?.text) break;
            const result = await createTodo({
              text: cmd.todo.text,
              scheduled_start: cmd.todo.scheduled_start,
              estimated_minutes: cmd.todo.estimated_minutes,
              priority: cmd.todo.priority,
              goal_id: (cmd.todo as any)._matched_goal_id,
              reminder_before: cmd.todo.reminder?.before_minutes,
              reminder_types: cmd.todo.reminder?.types,
              recurrence_rule: cmd.todo.recurrence?.rule,
              recurrence_end: cmd.todo.recurrence?.end_date,
            });
            if (result?.id) createdIds.push(result.id);
            await triggerIntentDispatch(cmd);
            break;
          }
          case "complete": {
            if (!cmd.target_id) break;
            await updateTodo(cmd.target_id, { done: true });
            completedIds.push(cmd.target_id);
            break;
          }
          case "modify": {
            if (!cmd.target_id || !cmd.changes) break;
            // 保存原值用于撤销（从 changes 的反向推导）
            modifiedEntries.push({ id: cmd.target_id, original: {} });
            await updateTodo(cmd.target_id, {
              text: cmd.changes.text,
              scheduled_start: cmd.changes.scheduled_start,
              estimated_minutes: cmd.changes.estimated_minutes,
              priority: cmd.changes.priority,
              reminder_before: cmd.changes.reminder?.before_minutes,
              reminder_types: cmd.changes.reminder?.types,
              recurrence_rule: cmd.changes.recurrence?.rule,
              recurrence_end: cmd.changes.recurrence?.end_date,
            });
            await triggerIntentDispatch(cmd);
            break;
          }
        }
      }

      emit("recording:processed");

      // 构建 toast 消息
      const summaries: string[] = [];
      for (const cmd of commands) {
        if (cmd.action_type === "create" && cmd.todo?.text) {
          summaries.push(`创建「${cmd.todo.text}」`);
        } else if (cmd.action_type === "complete") {
          summaries.push("完成待办");
        } else if (cmd.action_type === "modify") {
          summaries.push("修改待办");
        }
      }
      const message = summaries.length > 0 ? `已${summaries.join("、")}` : "指令已执行";

      showUndoToast({
        message,
        duration: 5000,
        onUndo: async () => {
          try {
            // 撤销创建：删除
            for (const id of createdIds) {
              await deleteTodo(id);
            }
            // 撤销完成：重新打开
            for (const id of completedIds) {
              await updateTodo(id, { done: false });
            }
            emit("recording:processed");
            fabNotify.info("已撤销");
          } catch (err: any) {
            fabNotify.error("撤销失败");
          }
        },
      });
    } catch (err: any) {
      fabNotify.error("执行失败: " + (err.message || "未知错误"));
    }
  }, [triggerIntentDispatch]);

  const backHandler = useMemo(() => {
    if (activeOverlay) return () => setActiveOverlay(null);
    return null;
  }, [activeOverlay]);

  useBackHandler(backHandler);

  const openOverlay = useCallback((name: string, _args?: string[]) => {
    setActiveOverlay(name as OverlayName);
  }, []);

  const closeOverlay = useCallback(() => {
    setActiveOverlay(null);
    window.dispatchEvent(new Event("ai-window:chat-return"));
  }, []);

  const handleStartReview = useCallback((range: { start: string; end: string }) => {
    setChatDateRange(range);
    setChatInitialMessage(undefined);
    setChatMode("review");
    setActiveOverlay("chat");
  }, []);

  const handleStartInsight = useCallback((range: { start: string; end: string }, _skillName: string) => {
    setChatDateRange(range);
    setChatInitialMessage(undefined);
    setChatMode("insight");
    setActiveOverlay("chat");
  }, []);

  const handleOpenCommandChat = useCallback((initialText?: string) => {
    const today = getLocalToday();
    setChatDateRange({ start: today, end: today });
    setChatInitialMessage(initialText);
    setChatSkill(undefined);
    setChatMode("command");
    setActiveOverlay("chat");
  }, []);

  const handleOpenSkillChat = useCallback((skillName: string) => {
    const today = getLocalToday();
    setChatDateRange({ start: today, end: today });
    setChatInitialMessage(undefined);
    setChatSkill(skillName);
    setChatMode("command");
    setActiveOverlay("chat");
  }, []);

  const handleCommandDetected = useCallback((command: string, args?: string[]) => {
    openOverlay(command, args);
  }, [openOverlay]);

  const showHelp = useCallback(() => {
    const commands = getCommandDefs();
    const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join("\n");
    fabNotify.info(helpText);
  }, []);

  const handleExport = useCallback((_format: string) => {
    fabNotify.info("导出功能开发中...");
  }, []);

  const handleNotificationNavigate = useCallback((type: AppNotification["type"]) => {
    switch (type) {
      case "morning_briefing":
        setActiveOverlay("daily-report");
        break;
      case "evening_summary":
        setActiveOverlay("evening-summary");
        break;
      case "todo_nudge":
        setActiveTab("todo");
        setActiveOverlay(null);
        break;
      case "relay_reminder":
        setActiveTab("todo");
        setActiveOverlay(null);
        break;
      case "cognitive_alert":
        setActiveOverlay(null);
        break;
    }
  }, []);

  // Swipe: 左边缘右滑打开侧边栏, diary ↔ todo 切换
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      // 如果手势发生在可侧滑的待办项或日历区域内，跳过全局手势，避免冲突
      const target = e.target as HTMLElement;
      if (
        target.closest?.("[data-testid='swipeable-task-item']") ||
        target.closest?.("[data-testid='calendar-strip']") ||
        target.closest?.("[data-testid='calendar-expand']")
      ) return;

      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      // 忽略垂直滑动为主的手势
      if (Math.abs(dy) > Math.abs(dx)) return;
      // 从屏幕左侧（30~200px，避开安卓系统返回手势区）右滑超过 60px → 打开侧边栏（仅日记页）
      if (activeTab === "diary" && touchStartX.current > 30 && touchStartX.current < 200 && dx > 60) {
        setShowSidebar(true);
        return;
      }
      if (Math.abs(dx) > 80) {
        if (dx < 0 && activeTab === "diary") setActiveTab("todo"); // 左滑 → 待办
        if (dx > 0 && activeTab === "todo") setActiveTab("diary"); // 右滑 → 日记
      }
    },
    [activeTab],
  );

  // PC redirect
  const [pcRedirecting, setPcRedirecting] = useState(false);
  useEffect(() => {
    if (window.innerWidth >= 768) {
      setPcRedirecting(true);
      router.replace("/write");
    }
  }, [router]);

  if (pcRedirecting) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <p className="text-sm text-muted-accessible">加载中...</p>
      </div>
    );
  }

  // Auth gate
  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-surface">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-deer/10 flex items-center justify-center">
            <span className="text-2xl">🦌</span>
          </div>
          <p className="text-sm text-muted-accessible">加载中...</p>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    if (authMode === "forgot-password") {
      return (
        <ForgotPassword
          onBack={() => { clearError(); setAuthMode("login"); }}
        />
      );
    }
    if (authMode === "register") {
      return (
        <RegisterPage
          onRegister={register}
          onRegisterWithEmail={registerEmail}
          onSwitchToLogin={() => { clearError(); setAuthMode("login"); }}
          error={authError}
        />
      );
    }
    return (
      <LoginPage
        onLogin={login}
        onLoginWithEmail={loginEmail}
        onSwitchToRegister={() => { clearError(); setAuthMode("register"); }}
        onForgotPassword={() => { clearError(); setAuthMode("forgot-password"); }}
        error={authError}
      />
    );
  }

  if (isFirstTime) {
    return (
      <OnboardingSeed
        onComplete={() => {
          if (user?.id) localStorage.setItem(`v2note:onboarded:${user.id}`, "true");
          localStorage.setItem("v2note:onboarded", "true");
          setIsFirstTime(false);
          setTimeout(() => emit("recording:processed"), 500);
          // 触发功能引导
          setShowGuide(true);
        }}
        onSkip={() => {
          if (user?.id) localStorage.setItem(`v2note:onboarded:${user.id}`, "true");
          localStorage.setItem("v2note:onboarded", "true");
          setIsFirstTime(false);
          // 触发功能引导
          setShowGuide(true);
        }}
      />
    );
  }

  return (
    <div className="bg-surface max-w-lg mx-auto relative flex flex-col overflow-hidden" style={{ height: "var(--app-height, 100dvh)" }}>
      <SidebarDrawer
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        onViewProfile={() => setActiveOverlay("user-settings")}
        onViewBriefing={() => setActiveOverlay("daily-report")}
        onViewSettings={() => setActiveOverlay("settings")}
        onViewSearch={() => setActiveOverlay("search")}
        wikiPages={sidebarPages}
        inboxCount={inboxCount}
        pendingSuggestionCount={pendingSuggestionCount}
        onOpenSuggestions={() => {
          refreshSuggestions();
          setShowSuggestions(true);
        }}
        onSelectPage={(pageId) => {
          setWikiPageFilter(pageId);
          setActiveTab("diary");
        }}
        onCreatePage={(title, pageType) => {
          api.post("/api/v1/wiki/pages", { title, page_type: pageType })
            .then(() => fetchSidebar())
            .catch(() => {});
        }}
        onRenamePage={(pageId, newTitle) => {
          api.patch(`/api/v1/wiki/pages/${pageId}`, { title: newTitle })
            .then(() => fetchSidebar())
            .catch(() => {});
        }}
        onDeletePage={(pageId) => {
          api.delete(`/api/v1/wiki/pages/${pageId}`)
            .then(() => fetchSidebar())
            .catch(() => {});
        }}
        onLogout={logout}
        userName={user?.displayName}
        userPhone={user?.phone}
      />
      {showSuggestions && (
        <SuggestionList
          suggestions={suggestions}
          onAccept={(id) => {
            acceptSuggestion(id);
            setPendingSuggestionCount((c) => Math.max(0, c - 1));
          }}
          onReject={(id) => {
            rejectSuggestion(id);
            setPendingSuggestionCount((c) => Math.max(0, c - 1));
          }}
          onClose={() => setShowSuggestions(false)}
        />
      )}
      <OfflineBanner />
      <UpdateDialog update={update} onDismiss={dismiss} applying={applying} />

      {/* Workspace Header: 头像 + Segment(日记|待办) + 搜索 */}
      <WorkspaceHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAvatarClick={() => setShowSidebar(true)}
        onChatClick={() => handleOpenCommandChat()}
        onSearchClick={() => setActiveOverlay("search")}
        userName={user?.displayName}
        wikiPageFilter={wikiPageFilter}
        wikiPageFilterLabel={wikiPageFilter === "__inbox__" ? "未整理" : sidebarPages.find(p => p.id === wikiPageFilter)?.title}
        onClearWikiPageFilter={() => setWikiPageFilter(null)}
        todoViewMode={todoViewMode}
        onTodoViewModeChange={setTodoViewMode}
      />

      {/* 工作区内容: 日记 or 待办 (swipeable) — 保持双 tab 挂载避免切换重载 */}
      <main
        ref={mainScrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <PullRefreshIndicator
          pullDistance={pullToRefresh.pullDistance}
          isReady={pullToRefresh.isReady}
          isRefreshing={pullToRefresh.isRefreshing}
        />
        <div className={activeTab === "diary" ? "bg-surface-low animate-tab-fade-in" : "hidden"}>
          <NotesTimeline
            notebook={activeNotebook}
            wikiPageFilter={wikiPageFilter}
            onOpenChat={handleOpenCommandChat}
            onOpenOverlay={openOverlay}
            onRegisterRefresh={(fn) => { diaryRefreshRef.current = fn; }}
          />
        </div>
        <div className={activeTab === "todo" ? "animate-tab-fade-in" : "hidden"}>
          <TodoWorkspace
            onOpenChat={handleOpenCommandChat}
            viewMode={todoViewMode}
            onRegisterRefresh={(fn) => { todoRefreshRef.current = fn; }}
          />
        </div>
      </main>

      {/* FAB 录音按钮 — 弹窗打开时隐藏 */}
      <FAB
        visible={!activeOverlay && !showSidebar && !showSuggestions}
        activeNotebook={activeNotebook}
        sourceContext={activeOverlay === "chat" ? "chat" : activeOverlay === "review" ? "review" : activeTab === "todo" ? "todo" : "timeline"}
        onStartReview={(range) => {
          setChatDateRange(range);
          setChatInitialMessage(undefined);
          setActiveOverlay("chat");
        }}
        onCommandDetected={handleCommandDetected}
        onOpenCommandChat={handleOpenCommandChat}
        onOpenSkillChat={handleOpenSkillChat}
        commandContext={{
          setTheme,
          exportData: handleExport,
          startReview: handleStartReview,
          showHelp,
          openOverlay,
        }}
        onRecordingChange={setFabRecording}
      />

      {/* CommandSheet — 语音指令确认弹窗 */}
      <CommandSheet
        open={commandSheetOpen}
        onClose={() => setCommandSheetOpen(false)}
        transcript={commandSheetTranscript}
        commands={commandSheetCommands}
        mode={commandSheetMode}
        toolStatuses={commandToolStatuses}
        onConfirm={handleCommandConfirm}
        onCancel={() => setCommandSheetOpen(false)}
        onContinueSpeak={() => { /* v2: trigger recording again */ }}
        onTextSubmit={async (text) => {
          try {
            const { getGatewayClient } = await import("@/features/chat/lib/gateway-client");
            const client = getGatewayClient();
            // 发送修改指令，gateway 返回 process.result 会自动更新 commands
            client.send({
              type: "todo.refine",
              payload: { commands: commandSheetCommands, modificationText: text },
            });
          } catch (err: any) {
            console.error("[CommandSheet] text submit error:", err);
          }
        }}
        onViewMore={(params) => {
          setCommandSheetOpen(false);
          if (params.goal_id) {
            setSelectedGoalId(params.goal_id);
            setActiveOverlay("goal-detail");
          }
          setActiveTab("todo");
        }}
      />

      {/* Overlays — AnimatePresence + OverlayTransition 统一 slide-in/out 转场 */}
      <AnimatePresence mode="wait">
      {activeOverlay === "search" ? (
        <OverlayTransition motionKey="search">
          <SearchView onClose={closeOverlay} />
        </OverlayTransition>
      ) : activeOverlay === "chat" && chatDateRange ? (
        <OverlayTransition motionKey="chat">
          <ChatView
            dateRange={chatDateRange}
            onClose={() => {
              closeOverlay();
              setChatInitialMessage(undefined);
              setChatSkill(undefined);
              setChatMode("review");
            }}
            initialMessage={chatInitialMessage}
            mode={chatMode}
            skill={chatSkill}
            commandContext={{
              setTheme,
              exportData: handleExport,
              startReview: handleStartReview,
              showHelp,
              openOverlay,
            }}
          />
        </OverlayTransition>
      ) : activeOverlay === "review" ? (
        <OverlayTransition motionKey="review">
          <ReviewOverlay onClose={closeOverlay} onStartInsight={handleStartInsight} />
        </OverlayTransition>
      ) : activeOverlay === "profile" ? (
        <OverlayTransition motionKey="profile">
          <ProfileEditor onClose={closeOverlay} />
        </OverlayTransition>
      ) : activeOverlay === "user-settings" ? (
        <OverlayTransition motionKey="user-settings">
          <UserSettings onClose={closeOverlay} onLogout={logout} />
        </OverlayTransition>
      ) : activeOverlay === "settings" ? (
        <OverlayTransition motionKey="settings">
          <SettingsEditor
            onClose={closeOverlay}
            onThemeChange={setTheme}
          />
        </OverlayTransition>
      ) : activeOverlay === "notebooks" ? (
        <OverlayTransition motionKey="notebooks">
          <NotebookList
            activeNotebook={activeNotebook}
            onClose={closeOverlay}
            onSelect={(name, _color) => {
              setActiveNotebook(name);
            }}
          />
        </OverlayTransition>
      ) : activeOverlay === "morning-briefing" ? (
        <OverlayTransition motionKey="morning-briefing">
          <MorningBriefing onClose={closeOverlay} />
        </OverlayTransition>
      ) : activeOverlay === "evening-summary" ? (
        <OverlayTransition motionKey="evening-summary">
          <EveningSummary onClose={closeOverlay} />
        </OverlayTransition>
      ) : activeOverlay === "daily-report" ? (
        <OverlayTransition motionKey="daily-report">
          <SmartDailyReport onClose={closeOverlay} />
        </OverlayTransition>
      ) : activeOverlay === "notifications" ? (
        <OverlayTransition motionKey="notifications">
          <NotificationCenter
            onClose={closeOverlay}
            onNavigate={handleNotificationNavigate}
          />
        </OverlayTransition>
      ) : activeOverlay === "goals" ? (
        <OverlayTransition motionKey="goals">
          <GoalList
            onClose={closeOverlay}
            onViewGoal={(goalId) => {
              setSelectedGoalId(goalId);
              setActiveOverlay("goal-detail");
            }}
            onViewProject={(projectId) => {
              setSelectedGoalId(projectId);
              setActiveOverlay("project-detail");
            }}
          />
        </OverlayTransition>
      ) : activeOverlay === "goal-detail" && selectedGoalId ? (
        <OverlayTransition motionKey="goal-detail">
          <GoalDetailOverlay
            goalId={selectedGoalId}
            onClose={closeOverlay}
            onOpenChat={handleOpenCommandChat}
          />
        </OverlayTransition>
      ) : activeOverlay === "project-detail" && selectedGoalId ? (
        <OverlayTransition motionKey="project-detail">
          <ProjectDetailOverlay
            projectId={selectedGoalId}
            onClose={closeOverlay}
            onViewGoal={(goalId) => {
              setSelectedGoalId(goalId);
              setActiveOverlay("goal-detail");
            }}
          />
        </OverlayTransition>
      ) : null}
      </AnimatePresence>

      {/* 冷启动功能引导 Coach Mark */}
      {showGuide && (
        <CoachMark
          steps={[
            {
              target: "[data-guide='fab']",
              message: "按住说话，松开自动记录",
              placement: "top",
            },
            {
              target: "[data-guide='tab-todo']",
              message: "对路路说\u201C帮我建个待办\u201D\n试试语音指令",
              placement: "bottom",
            },
          ]}
          onComplete={() => {
            setShowGuide(false);
            if (user?.id) localStorage.setItem(`v2note:guide-done:${user.id}`, "true");
          }}
        />
      )}
    </div>
  );
}
