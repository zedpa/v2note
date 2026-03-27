"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { initStatusBar } from "@/shared/lib/status-bar";
import { WorkspaceHeader, type WorkspaceTab } from "@/features/workspace/components/workspace-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
import { TodoWorkspaceView } from "@/features/workspace/components/todo-workspace-view";
import { FAB } from "@/features/recording/components/fab";
import { SidebarDrawer } from "@/features/sidebar/components/sidebar-drawer";
import { SearchView } from "@/features/search/components/search-view";
import { ChatView } from "@/features/chat/components/chat-view";
import { OfflineBanner } from "@/shared/components/offline-banner";
import { StatsDashboard } from "@/features/sidebar/components/stats-dashboard";
import { MemorySoulOverlay } from "@/features/memory/components/memory-soul-overlay";
import { ReviewOverlay } from "@/features/reviews/components/review-overlay";
import { TodoPanel } from "@/features/todos/components/todo-panel";
import { TodayGantt } from "@/features/todos/components/today-gantt";
import { ProfileEditor } from "@/features/profile/components/profile-editor";
import { SettingsEditor } from "@/features/settings/components/settings-editor";
import { SkillsPage } from "@/features/skills/components/skills-page";
import { NotebookList } from "@/features/diary/components/notebook-list";
import { MorningBriefing } from "@/features/daily/components/morning-briefing";
import { EveningSummary } from "@/features/daily/components/evening-summary";
import { LifeMap } from "@/features/cognitive/components/life-map";
import { ClusterDetailView } from "@/features/cognitive/components/cluster-detail";
import { DecisionWorkspace } from "@/features/cognitive/components/decision-workspace";
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

type OverlayName =
  | "search"
  | "chat"
  | "stats"
  | "memory"
  | "review"
  | "skills"
  | "todos"
  | "today-todo"
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
  const [cognitiveMapOpen, setCognitiveMapOpen] = useState(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [decisionQuestion, setDecisionQuestion] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  const [chatMode, setChatMode] = useState<"review" | "command" | "insight">("review");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

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
        setCognitiveMapOpen(true);
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
        onViewStats={() => setActiveOverlay("stats")}
        onViewMemory={() => setActiveOverlay("memory")}
        onViewProfile={() => setActiveOverlay("profile")}
        onViewBriefing={() => setActiveOverlay("morning-briefing")}
        onViewSettings={() => setActiveOverlay("settings")}
        onViewSkills={() => setActiveOverlay("skills")}
        onViewReview={() => setActiveOverlay("review")}
        onViewSearch={() => setActiveOverlay("search")}
        onViewGoal={(goalId) => {
          setSelectedGoalId(goalId);
          setActiveOverlay("goal-detail");
        }}
        onViewGoals={() => setActiveOverlay("goals")}
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
      />

      {/* 工作区内容: 日记 or 待办 (swipeable) */}
      <main
        className="overflow-x-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeTab === "diary" ? (
          <div className="bg-surface-low">
            <NotesTimeline
              notebook={activeNotebook}
              onOpenChat={handleOpenCommandChat}
              onOpenOverlay={openOverlay}
            />
          </div>
        ) : (
          <TodoWorkspaceView onOpenChat={handleOpenCommandChat} />
        )}
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

      {/* Cognitive Map (Level 0) */}
      <LifeMap
        isOpen={cognitiveMapOpen}
        onClose={() => setCognitiveMapOpen(false)}
        onSelectCluster={(id) => {
          setSelectedClusterId(id);
          setCognitiveMapOpen(false);
        }}
      />

      {/* Cluster Detail (Level 2) */}
      {selectedClusterId && (
        <ClusterDetailView
          clusterId={selectedClusterId}
          isOpen={!!selectedClusterId}
          onClose={() => setSelectedClusterId(null)}
          onDecision={(q) => {
            setDecisionQuestion(q);
            setSelectedClusterId(null);
          }}
        />
      )}

      {/* Decision Workspace */}
      {decisionQuestion && (
        <DecisionWorkspace
          question={decisionQuestion}
          isOpen={!!decisionQuestion}
          onClose={() => setDecisionQuestion(null)}
        />
      )}

      {/* Overlays */}
      {activeOverlay === "search" && (
        <SearchView onClose={closeOverlay} />
      )}
      {activeOverlay === "chat" && chatDateRange && (
        <ChatView
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
      )}
      {activeOverlay === "stats" && (
        <StatsDashboard onClose={closeOverlay} />
      )}
      {activeOverlay === "memory" && (
        <MemorySoulOverlay onClose={closeOverlay} />
      )}
      {activeOverlay === "review" && (
        <ReviewOverlay onClose={closeOverlay} onStartInsight={handleStartInsight} />
      )}
      <TodoPanel
        open={activeOverlay === "todos"}
        onClose={closeOverlay}
      />
      {activeOverlay === "today-todo" && (
        <TodayGantt onClose={closeOverlay} />
      )}
      {activeOverlay === "profile" && (
        <ProfileEditor onClose={closeOverlay} />
      )}
      {activeOverlay === "skills" && (
        <SkillsPage onClose={closeOverlay} />
      )}
      {activeOverlay === "settings" && (
        <SettingsEditor
          onClose={closeOverlay}
          onThemeChange={setTheme}
        />
      )}
      {activeOverlay === "notebooks" && (
        <NotebookList
          activeNotebook={activeNotebook}
          onClose={closeOverlay}
          onSelect={(name, color) => {
            setActiveNotebook(name);
          }}
        />
      )}
      {activeOverlay === "morning-briefing" && (
        <MorningBriefing onClose={closeOverlay} />
      )}
      {activeOverlay === "evening-summary" && (
        <EveningSummary onClose={closeOverlay} />
      )}
      {activeOverlay === "notifications" && (
        <NotificationCenter
          onClose={closeOverlay}
          onNavigate={handleNotificationNavigate}
        />
      )}
      {activeOverlay === "goals" && (
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
      )}
      {activeOverlay === "goal-detail" && selectedGoalId && (
        <GoalDetailOverlay
          goalId={selectedGoalId}
          onClose={closeOverlay}
          onOpenChat={handleOpenCommandChat}
        />
      )}
      {activeOverlay === "project-detail" && selectedGoalId && (
        <ProjectDetailOverlay
          projectId={selectedGoalId}
          onClose={closeOverlay}
          onViewGoal={(goalId) => {
            setSelectedGoalId(goalId);
            setActiveOverlay("goal-detail");
          }}
        />
      )}
    </div>
  );
}
