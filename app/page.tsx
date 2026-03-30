"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { initStatusBar } from "@/shared/lib/status-bar";
import { WorkspaceHeader, type WorkspaceTab, type TopicFilter, type DimensionFilter } from "@/features/workspace/components/workspace-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
import { TodoWorkspaceView } from "@/features/workspace/components/todo-workspace-view";
import { TopicLifecycleView } from "@/features/workspace/components/topic-lifecycle-view";
import { FAB } from "@/features/recording/components/fab";
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
import { OnboardingSeed } from "@/features/cognitive/components/onboarding-seed";
import { GoalDetailOverlay } from "@/features/goals/components/goal-detail-overlay";
import { ProjectDetailOverlay } from "@/features/goals/components/project-detail-overlay";
import { GoalList } from "@/features/goals/components/goal-list";
import { toast } from "sonner";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { on } from "@/features/recording/lib/events";
import { useBackHandler } from "@/shared/hooks/use-back-handler";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/components/login-page";
import { RegisterPage } from "@/features/auth/components/register-page";
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
  | "notebooks"
  | "morning-briefing"
  | "evening-summary"
  | "goals"
  | "goal-detail"
  | "project-detail"
  | "notifications"
  | null;

export default function Page() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { loggedIn, user, loading: authLoading, error: authError, login, register, logout } = useAuth();
  const { update, dismiss, applying } = useUpdateCheck();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatMode, setChatMode] = useState<"review" | "command" | "insight">("review");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  // 主题筛选（场景 10: localStorage 持久化）
  const [topicFilter, setTopicFilter] = useState<TopicFilter | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("v2note:topicFilter");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  // 维度筛选（L3 全局 domain 过滤）
  const [dimensionFilter, setDimensionFilter] = useState<DimensionFilter | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem("v2note:dimensionFilter");
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (topicFilter) {
      localStorage.setItem("v2note:topicFilter", JSON.stringify(topicFilter));
    } else {
      localStorage.removeItem("v2note:topicFilter");
    }
  }, [topicFilter]);

  useEffect(() => {
    if (dimensionFilter) {
      localStorage.setItem("v2note:dimensionFilter", JSON.stringify(dimensionFilter));
    } else {
      localStorage.removeItem("v2note:dimensionFilter");
    }
  }, [dimensionFilter]);

  // Workspace: Segment tab (日记 | 待办)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window === "undefined") return "diary";
    return (localStorage.getItem("v2note:activeTab") as WorkspaceTab) || "diary";
  });

  // 持久化 tab 选择
  useEffect(() => {
    localStorage.setItem("v2note:activeTab", activeTab);
  }, [activeTab]);

  /** null = voice notes timeline, string = diary notebook name */
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);

  // Onboarding state
  const [isFirstTime, setIsFirstTime] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("v2note:onboarded") !== "true";
  });

  useEffect(() => {
    initStatusBar();
  }, []);

  // Auto-show morning briefing (7-10am, once per day)
  useEffect(() => {
    if (!loggedIn) return;
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 10) {
      const today = new Date().toISOString().split("T")[0];
      const key = `briefing_shown_${today}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setActiveOverlay("morning-briefing");
      }
    }
  }, [loggedIn]);

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
    setChatMode("command");
    setActiveOverlay("chat");
  }, []);

  const handleCommandDetected = useCallback((command: string, args?: string[]) => {
    openOverlay(command, args);
  }, [openOverlay]);

  const showHelp = useCallback(() => {
    const commands = getCommandDefs();
    const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join("\n");
    toast(helpText, { duration: 8000 });
  }, []);

  const handleExport = useCallback((_format: string) => {
    toast("导出功能开发中...");
  }, []);

  const handleNotificationNavigate = useCallback((type: AppNotification["type"]) => {
    switch (type) {
      case "morning_briefing":
        setActiveOverlay("morning-briefing");
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

  // Swipe between diary ↔ todo
  const touchStartX = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      if (Math.abs(dx) > 80) {
        if (dx < 0 && activeTab === "diary") setActiveTab("todo"); // 左滑 → 待办
        if (dx > 0 && activeTab === "todo") setActiveTab("diary"); // 右滑 → 日记
      }
    },
    [activeTab],
  );

  // PC redirect
  const [pcRedirecting] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth >= 768;
  });
  useEffect(() => {
    if (pcRedirecting) router.replace("/write");
  }, [pcRedirecting, router]);

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
    if (authMode === "register") {
      return (
        <RegisterPage
          onRegister={register}
          onSwitchToLogin={() => setAuthMode("login")}
          error={authError}
        />
      );
    }
    return (
      <LoginPage
        onLogin={login}
        onSwitchToRegister={() => setAuthMode("register")}
        error={authError}
      />
    );
  }

  if (isFirstTime) {
    return (
      <OnboardingSeed
        onComplete={() => {
          localStorage.setItem("v2note:onboarded", "true");
          setIsFirstTime(false);
        }}
        onSkip={() => {
          localStorage.setItem("v2note:onboarded", "true");
          setIsFirstTime(false);
        }}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-surface max-w-lg mx-auto relative">
      <SidebarDrawer
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        onViewProfile={() => setActiveOverlay("profile")}
        onViewBriefing={() => setActiveOverlay("morning-briefing")}
        onViewSettings={() => setActiveOverlay("settings")}
        onViewEvening={() => setActiveOverlay("evening-summary")}
        onViewSearch={() => setActiveOverlay("search")}
        onViewGoal={(goalId) => {
          setSelectedGoalId(goalId);
          setActiveOverlay("goal-detail");
        }}
        onViewGoals={() => setActiveOverlay("goals")}
        onOpenChat={handleOpenCommandChat}
        onSelectTopic={(clusterId, title) => {
          setTopicFilter({ clusterId, title });
          setActiveTab("todo");
        }}
        onSelectDimension={(domain) => {
          setDimensionFilter({ domain });
          setTopicFilter(null);
        }}
        onSelectToday={() => {
          setDimensionFilter(null);
          setTopicFilter(null);
          setActiveTab("todo");
        }}
        activeDimension={dimensionFilter?.domain}
        onLogout={logout}
        userName={user?.displayName}
        userPhone={user?.phone}
      />
      <OfflineBanner />
      <UpdateDialog update={update} onDismiss={dismiss} applying={applying} />

      {/* Workspace Header: 头像 + Segment(日记|待办) + 搜索 + 通知 */}
      <WorkspaceHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAvatarClick={() => setShowSidebar(true)}
        onSearchClick={() => setActiveOverlay("search")}
        onNotificationClick={() => setActiveOverlay("notifications")}
        userName={user?.displayName}
        topicFilter={topicFilter}
        onClearTopicFilter={() => setTopicFilter(null)}
        dimensionFilter={dimensionFilter}
        onClearDimensionFilter={() => setDimensionFilter(null)}
      />

      {/* 工作区内容: 日记 or 待办 (swipeable) — 保持双 tab 挂载避免切换重载 */}
      <main
        className="overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={activeTab === "diary" ? "bg-surface-low" : "hidden"}>
          <NotesTimeline
            notebook={activeNotebook}
            clusterId={topicFilter?.clusterId}
            domainFilter={dimensionFilter?.domain}
            onOpenChat={handleOpenCommandChat}
            onOpenOverlay={openOverlay}
          />
        </div>
        <div className={activeTab === "todo" ? undefined : "hidden"}>
          {topicFilter ? (
            <TopicLifecycleView
              clusterId={topicFilter.clusterId}
              onOpenChat={handleOpenCommandChat}
            />
          ) : (
            <TodoWorkspaceView
              onOpenChat={handleOpenCommandChat}
              domainFilter={dimensionFilter?.domain}
            />
          )}
        </div>
      </main>

      {/* FAB 录音按钮 — 常驻底部 */}
      <FAB
        activeNotebook={activeNotebook}
        onStartReview={(range) => {
          setChatDateRange(range);
          setChatInitialMessage(undefined);
          setActiveOverlay("chat");
        }}
        onCommandDetected={handleCommandDetected}
        onOpenCommandChat={handleOpenCommandChat}
        commandContext={{
          setTheme,
          exportData: handleExport,
          startReview: handleStartReview,
          showHelp,
          openOverlay,
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
            setChatMode("review");
          }}
          initialMessage={chatInitialMessage}
          mode={chatMode}
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
