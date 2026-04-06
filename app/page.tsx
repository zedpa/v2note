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
import { SidebarDrawer } from "@/features/sidebar/components/sidebar-drawer";
import { SearchView } from "@/features/search/components/search-view";
import { ChatView } from "@/features/chat/components/chat-view";
import { OfflineBanner } from "@/shared/components/offline-banner";
import { ReviewOverlay } from "@/features/reviews/components/review-overlay";
import { ProfileEditor } from "@/features/profile/components/profile-editor";
import { SettingsEditor } from "@/features/settings/components/settings-editor";
import { NotebookList } from "@/features/diary/components/notebook-list";
import { MorningBriefing } from "@/features/daily/components/morning-briefing";
import { EveningSummary } from "@/features/daily/components/evening-summary";
import { SmartDailyReport } from "@/features/daily/components/smart-daily-report";
import { OnboardingSeed } from "@/features/cognitive/components/onboarding-seed";
import { GoalDetailOverlay } from "@/features/goals/components/goal-detail-overlay";
import { ProjectDetailOverlay } from "@/features/goals/components/project-detail-overlay";
import { GoalList } from "@/features/goals/components/goal-list";
import { fabNotify } from "@/shared/lib/fab-notify";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";
import { createTodo, updateTodo, deleteTodo } from "@/shared/lib/api/todos";
import { getSettings, setCurrentUserId } from "@/shared/lib/local-config";
import {
  scheduleDailyNotifications,
  cancelDailyNotifications,
  addNotificationClickListener,
  requestNotificationPermission,
} from "@/shared/lib/notifications";
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
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import type { AppNotification } from "@/features/notifications/hooks/use-notifications";
import { AnimatePresence, motion } from "framer-motion";

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
  const [domainFilter, setDomainFilter] = useState<string | null>(null);

  // ── 文件夹列表：localStorage 缓存 + 事件刷新 ──
  const [cachedDomains, setCachedDomains] = useState<Array<{ domain: string; count: number }>>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("v2note:domains") || "[]");
    } catch { return []; }
  });
  const fetchDomains = useCallback(() => {
    api.get<{ domains: Array<{ domain: string; count: number }> }>("/api/v1/records/domains")
      .then((res) => {
        const domains = res.domains ?? [];
        setCachedDomains(domains);
        localStorage.setItem("v2note:domains", JSON.stringify(domains));
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!loggedIn) return;
    fetchDomains();
    // 手动文字输入时 processEntry 在后台运行，domain 可能延迟写入
    // 额外延迟刷新确保 AI 处理完成后能拿到分类数据
    let delayTimer: ReturnType<typeof setTimeout>;
    const unsub = on("recording:processed", () => {
      fetchDomains();
      clearTimeout(delayTimer);
      delayTimer = setTimeout(fetchDomains, 8000);
    });
    return () => { unsub(); clearTimeout(delayTimer); };
  }, [loggedIn, fetchDomains]);
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

  // ── Settings 按用户隔离 ──
  useEffect(() => {
    setCurrentUserId(loggedIn && user?.id ? user.id : null);
  }, [loggedIn, user?.id]);

  // Onboarding state — 按用户维度判断，旧设备新用户也能触发冷启动
  const [isFirstTime, setIsFirstTime] = useState(false);
  useEffect(() => {
    if (!loggedIn || !user?.id) return;
    const key = `v2note:onboarded:${user.id}`;
    if (localStorage.getItem(key) !== "true") {
      setIsFirstTime(true);
    }
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
      const today = now.toISOString().split("T")[0];
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
          ? new Date(now.getTime() - 86400000).toISOString().split("T")[0]
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

  // ── 本地通知调度 + 点击跳转 ──
  useEffect(() => {
    if (!loggedIn) return;
    let removeListener: (() => void) | undefined;

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

      // 监听通知点击 → 打开日报
      removeListener = await addNotificationClickListener((action) => {
        if (action === "morning-briefing") {
          setActiveOverlay("morning-briefing");
        } else if (action === "evening-summary") {
          setActiveOverlay("evening-summary");
        }
      });
    })();

    return () => { removeListener?.(); };
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
  }, []);

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
  }, []);

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
    const today = new Date().toISOString().split("T")[0];
    setChatDateRange({ start: today, end: today });
    setChatInitialMessage(initialText);
    setChatSkill(undefined);
    setChatMode("command");
    setActiveOverlay("chat");
  }, []);

  const handleOpenSkillChat = useCallback((skillName: string) => {
    const today = new Date().toISOString().split("T")[0];
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
      // 如果手势发生在可侧滑的待办项内，跳过全局手势，避免冲突
      const target = e.target as HTMLElement;
      if (target.closest?.("[data-testid='swipeable-task-item']")) return;

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
        }}
        onSkip={() => {
          if (user?.id) localStorage.setItem(`v2note:onboarded:${user.id}`, "true");
          localStorage.setItem("v2note:onboarded", "true");
          setIsFirstTime(false);
          // 跳过时标记 onboarding 完成
          api.post("/api/v1/onboarding/chat", { step: 2, answer: "" }).catch(() => {});
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
        domains={cachedDomains}
        onSelectDomain={(domain) => {
          setDomainFilter(domain);
          setActiveTab("diary");
        }}
        onLogout={logout}
        userName={user?.displayName}
        userPhone={user?.phone}
      />
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
        domainFilter={domainFilter}
        onClearDomainFilter={() => setDomainFilter(null)}
        todoViewMode={todoViewMode}
        onTodoViewModeChange={setTodoViewMode}
      />

      {/* 工作区内容: 日记 or 待办 (swipeable) — 保持双 tab 挂载避免切换重载 */}
      <main
        className="flex-1 overflow-x-hidden overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={activeTab === "diary" ? "bg-surface-low" : "hidden"}>
          <NotesTimeline
            notebook={activeNotebook}
            domainFilter={domainFilter}
            onOpenChat={handleOpenCommandChat}
            onOpenOverlay={openOverlay}
          />
        </div>
        <div className={activeTab === "todo" ? undefined : "hidden"}>
          <TodoWorkspace
            onOpenChat={handleOpenCommandChat}
            viewMode={todoViewMode}
          />
        </div>
      </main>

      {/* FAB 录音按钮 — 常驻底部 */}
      <FAB
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
            const { getDeviceId } = await import("@/shared/lib/device");
            const client = getGatewayClient();
            const deviceId = await getDeviceId();
            // 发送修改指令，gateway 返回 process.result 会自动更新 commands
            client.send({
              type: "todo.refine",
              payload: { deviceId, commands: commandSheetCommands, modificationText: text },
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

      {/* Overlays — AnimatePresence 统一转场，key 由 activeOverlay 驱动 */}
      <AnimatePresence mode="wait">
      {activeOverlay === "search" ? (
        <SearchView key="search" onClose={closeOverlay} />
      ) : activeOverlay === "chat" && chatDateRange ? (
        <ChatView
          key="chat"
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
      ) : activeOverlay === "review" ? (
        <ReviewOverlay key="review" onClose={closeOverlay} onStartInsight={handleStartInsight} />
      ) : activeOverlay === "profile" ? (
        <ProfileEditor key="profile" onClose={closeOverlay} />
      ) : activeOverlay === "user-settings" ? (
        <UserSettings key="user-settings" onClose={closeOverlay} onLogout={logout} />
      ) : activeOverlay === "settings" ? (
        <SettingsEditor
          key="settings"
          onClose={closeOverlay}
          onThemeChange={setTheme}
        />
      ) : activeOverlay === "notebooks" ? (
        <NotebookList
          key="notebooks"
          activeNotebook={activeNotebook}
          onClose={closeOverlay}
          onSelect={(name, _color) => {
            setActiveNotebook(name);
          }}
        />
      ) : activeOverlay === "morning-briefing" ? (
        <MorningBriefing key="morning-briefing" onClose={closeOverlay} />
      ) : activeOverlay === "evening-summary" ? (
        <EveningSummary key="evening-summary" onClose={closeOverlay} />
      ) : activeOverlay === "daily-report" ? (
        <SmartDailyReport key="daily-report" onClose={closeOverlay} />
      ) : activeOverlay === "notifications" ? (
        <NotificationCenter
          key="notifications"
          onClose={closeOverlay}
          onNavigate={handleNotificationNavigate}
        />
      ) : activeOverlay === "goals" ? (
        <GoalList
          key="goals"
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
      ) : activeOverlay === "goal-detail" && selectedGoalId ? (
        <GoalDetailOverlay
          key="goal-detail"
          goalId={selectedGoalId}
          onClose={closeOverlay}
          onOpenChat={handleOpenCommandChat}
        />
      ) : activeOverlay === "project-detail" && selectedGoalId ? (
        <ProjectDetailOverlay
          key="project-detail"
          projectId={selectedGoalId}
          onClose={closeOverlay}
          onViewGoal={(goalId) => {
            setSelectedGoalId(goalId);
            setActiveOverlay("goal-detail");
          }}
        />
      ) : null}
      </AnimatePresence>
    </div>
  );
}
