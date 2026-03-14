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
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();
  /** null = voice notes timeline, string = diary notebook name */
  const [activeNotebook, setActiveNotebook] = useState<string | null>(null);
  const [activeNotebookColor, setActiveNotebookColor] = useState<string | null>(null);

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
    setActiveOverlay("chat");
  }, []);

  const handleOpenCommandChat = useCallback((initialText?: string) => {
    const today = new Date().toISOString().split("T")[0];
    setChatDateRange({ start: today, end: today });
    setChatInitialMessage(initialText);
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
        onLogout={logout}
        userName={user?.displayName}
        userPhone={user?.phone}
      />
      <OfflineBanner />
      <UpdateDialog update={update} onDismiss={dismiss} applying={applying} />
      {/* Proactive messages now handled by AiWindow inside NotesTimeline */}

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
          }}
          initialMessage={chatInitialMessage}
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
        <ReviewOverlay onClose={closeOverlay} />
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
