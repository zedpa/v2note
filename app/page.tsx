"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { initStatusBar } from "@/shared/lib/status-bar";
import { NewHeader } from "@/shared/components/new-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
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
import { ActionPanel } from "@/features/action-panel/components/action-panel";
import { LifeMap } from "@/features/cognitive/components/life-map";
import { ClusterDetailView } from "@/features/cognitive/components/cluster-detail";
import { DecisionWorkspace } from "@/features/cognitive/components/decision-workspace";
import { LinkHint } from "@/features/cognitive/components/link-hint";
import { OnboardingSeed } from "@/features/cognitive/components/onboarding-seed";
import { LayoutGrid, Minus, Brain } from "lucide-react";
import { toast } from "sonner";
import { getCommandDefs } from "@/features/commands/lib/registry";
// NudgeToastListener replaced by AiWindow (inside NotesTimeline)
import { useBackHandler } from "@/shared/hooks/use-back-handler";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { LoginPage } from "@/features/auth/components/login-page";
import { RegisterPage } from "@/features/auth/components/register-page";
import { useUpdateCheck } from "@/shared/hooks/use-update-check";
import { UpdateDialog } from "@/shared/components/update-dialog";

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
  | null;

export default function Page() {
  const { setTheme } = useTheme();
  const { loggedIn, user, loading: authLoading, error: authError, login, register, logout } = useAuth();
  const { update, dismiss, applying } = useUpdateCheck();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showSidebar, setShowSidebar] = useState(false);
  const [actionPanelOpen, setActionPanelOpen] = useState(false);
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
  const [viewMode, setViewMode] = useState<"pure" | "timeline">("pure");
  /** null = voice notes timeline, string = diary notebook name */
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);
  const [activeNotebookColor, setActiveNotebookColor] = useState<string | null>(null);

  // Onboarding state
  const [isFirstTime, setIsFirstTime] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("v2note:onboarded") !== "true";
  });

  // Real-time clock for pure view
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (viewMode !== "pure") return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [viewMode]);

  // LinkHint text from localStorage
  const [linkHint, setLinkHint] = useState<string | null>(null);
  useEffect(() => {
    setLinkHint(localStorage.getItem("v2note:lastLinkHint"));
    const onHintUpdate = () => {
      setLinkHint(localStorage.getItem("v2note:lastLinkHint"));
    };
    window.addEventListener("v2note:linkHintUpdated", onHintUpdate);
    return () => window.removeEventListener("v2note:linkHintUpdated", onHintUpdate);
  }, []);

  const NOTEBOOK_LABEL_MAP: Record<string, string> = {
    "ai-self": "AI 工作日志",
    default: "日常日记",
  };
  const activeNotebookName = activeNotebook ? (NOTEBOOK_LABEL_MAP[activeNotebook] ?? activeNotebook) : null;

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
    // Notify AiWindow that chat/overlay was closed
    window.dispatchEvent(new Event("ai-window:chat-return"));
  }, []);

  const handleStartReview = useCallback((range: { start: string; end: string }) => {
    setChatDateRange(range);
    setChatInitialMessage(undefined);
    setChatMode("review");
    setActiveOverlay("chat");
  }, []);

  const handleStartInsight = useCallback((range: { start: string; end: string }, _skillName: string) => {
    // skillName is already saved to local config by ReviewOverlay
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

  // Auth gate: show login/register if not logged in
  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-2xl">🎙</span>
          </div>
          <p className="text-sm text-muted-foreground">加载中...</p>
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
    <div className="min-h-dvh bg-background max-w-lg mx-auto relative">
      <SidebarDrawer
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        onViewStats={() => setActiveOverlay("stats")}
        onViewMemory={() => setActiveOverlay("memory")}
        onViewProfile={() => setActiveOverlay("profile")}
        onViewBriefing={() => setActiveOverlay("morning-briefing")}
        onViewSettings={() => setActiveOverlay("settings")}
        onViewSkills={() => setActiveOverlay("skills")}
        onLogout={logout}
        userName={user?.displayName}
        userPhone={user?.phone}
      />
      <OfflineBanner />
      <UpdateDialog update={update} onDismiss={dismiss} applying={applying} />
      {/* Proactive messages now handled by AiWindow inside NotesTimeline */}

      {/* View mode toggle + cognitive map entry */}
      <div className="fixed top-4 right-4 z-40 flex gap-2">
        <button
          onClick={() => setCognitiveMapOpen(true)}
          className={`w-9 h-9 rounded-full backdrop-blur flex items-center justify-center transition-colors ${
            viewMode === "pure"
              ? "bg-transparent border border-bark/15 text-bark/40 hover:text-bark/70 hover:border-bark/30"
              : "bg-muted/60 text-muted-foreground/70 hover:text-foreground"
          }`}
          aria-label="认知地图"
        >
          <Brain size={16} />
        </button>
        <button
          onClick={() => setViewMode(viewMode === "pure" ? "timeline" : "pure")}
          className={`w-9 h-9 rounded-full backdrop-blur flex items-center justify-center transition-colors ${
            viewMode === "pure"
              ? "bg-transparent border border-bark/15 text-bark/40 hover:text-bark/70 hover:border-bark/30"
              : "bg-muted/60 text-muted-foreground/70 hover:text-foreground"
          }`}
          aria-label={viewMode === "pure" ? "切换到时间线" : "切换到纯净模式"}
        >
          {viewMode === "pure" ? <LayoutGrid size={16} /> : <Minus size={16} />}
        </button>
      </div>

      {viewMode === "pure" ? (
        <main className="fixed inset-0 flex flex-col items-center justify-center select-none bg-cream">
          {/* Radial warm glow behind time */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: 320,
              height: 320,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(196,120,58,0.08) 0%, rgba(196,120,58,0.03) 40%, transparent 70%)",
            }}
          />
          <p className="relative font-serif text-6xl font-extralight tracking-wider text-bark animate-breathe">
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </p>
          <p className="relative mt-3 font-serif text-xs tracking-widest text-bark/40">
            {now.getMonth() + 1}月{now.getDate()}日{" "}
            周{["日", "一", "二", "三", "四", "五", "六"][now.getDay()]}
          </p>
          <div className="relative mt-6 [&_p]:!text-bark/40">
            <LinkHint text={linkHint} />
          </div>
        </main>
      ) : (
        <>
          <NewHeader
            onSearchClick={() => setActiveOverlay("search")}
            onAvatarClick={() => setShowSidebar(true)}
            onInsightClick={() => setActiveOverlay("review")}
            onTodosClick={() => setActiveOverlay("todos")}
            onNotebookClick={() => setActiveOverlay("notebooks")}
            activeNotebookName={activeNotebookName}
            activeNotebookColor={activeNotebookColor}
            userName={user?.displayName}
          />

          <main className="pb-6">
            <NotesTimeline
              notebook={activeNotebook}
              onOpenChat={handleOpenCommandChat}
              onOpenOverlay={openOverlay}
            />
          </main>
        </>
      )}

      {/* Swipe-up trigger zone for ActionPanel */}
      {!actionPanelOpen && (
        <div
          className="fixed bottom-0 left-0 right-0 h-6 z-30"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).dataset.startY = String(e.clientY);
          }}
          onPointerMove={(e) => {
            const startY = Number((e.currentTarget as HTMLElement).dataset.startY);
            if (startY && startY - e.clientY > 30) {
              setActionPanelOpen(true);
              (e.currentTarget as HTMLElement).dataset.startY = "";
            }
          }}
        />
      )}

      {!actionPanelOpen && (
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
      )}

      <ActionPanel
        isOpen={actionPanelOpen}
        onClose={() => setActionPanelOpen(false)}
        onTraverse={() => {
          setActionPanelOpen(false);
          setCognitiveMapOpen(true);
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

      {/* Decision Workspace (Think) */}
      {decisionQuestion && (
        <DecisionWorkspace
          question={decisionQuestion}
          isOpen={!!decisionQuestion}
          onClose={() => setDecisionQuestion(null)}
        />
      )}

      {/* Overlays — command-driven */}
      {activeOverlay === "search" && (
        <SearchView
          onClose={closeOverlay}
        />
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
            setActiveNotebookColor(name ? (color ?? null) : null);
          }}
        />
      )}
      {activeOverlay === "morning-briefing" && (
        <MorningBriefing onClose={closeOverlay} />
      )}
      {activeOverlay === "evening-summary" && (
        <EveningSummary onClose={closeOverlay} />
      )}
    </div>
  );
}
