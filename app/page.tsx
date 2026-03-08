"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTheme } from "next-themes";
import { initStatusBar } from "@/shared/lib/status-bar";
import { NewHeader } from "@/shared/components/new-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
import { FAB } from "@/features/recording/components/fab";
import { SidebarDrawer } from "@/features/sidebar/components/sidebar-drawer";
import { NoteDetail } from "@/features/notes/components/note-detail";
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
import { MorningBriefing } from "@/features/daily/components/morning-briefing";
import { EveningSummary } from "@/features/daily/components/evening-summary";
import { toast } from "sonner";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { NudgeToastListener } from "@/features/proactive/components/nudge-toast";
import { useBackHandler } from "@/shared/hooks/use-back-handler";

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
  | "morning-briefing"
  | "evening-summary"
  | null;

export default function Page() {
  const { setTheme } = useTheme();
  const [showSidebar, setShowSidebar] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<OverlayName>(null);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);
  const [chatInitialMessage, setChatInitialMessage] = useState<string | undefined>();

  useEffect(() => {
    initStatusBar();
  }, []);

  // Auto-show morning briefing (7-10am, once per day)
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 7 && hour < 10) {
      const today = new Date().toISOString().split("T")[0];
      const key = `briefing_shown_${today}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, "1");
        setActiveOverlay("morning-briefing");
      }
    }
  }, []);

  const backHandler = useMemo(() => {
    if (detailId) return () => setDetailId(null);
    if (activeOverlay) return () => setActiveOverlay(null);
    return null;
  }, [detailId, activeOverlay]);

  useBackHandler(backHandler);

  const openOverlay = useCallback((name: string, _args?: string[]) => {
    setActiveOverlay(name as OverlayName);
  }, []);

  const closeOverlay = useCallback(() => {
    setActiveOverlay(null);
  }, []);

  const handleStartReview = useCallback((range: { start: string; end: string }) => {
    setChatDateRange(range);
    setChatInitialMessage(undefined);
    setActiveOverlay("chat");
  }, []);

  const handleOpenCommandChat = useCallback((initialText: string) => {
    const today = new Date().toISOString().split("T")[0];
    setChatDateRange({ start: today, end: today });
    setChatInitialMessage(initialText);
    setActiveOverlay("chat");
  }, []);

  const handleCommandDetected = useCallback((command: string, args?: string[]) => {
    // Voice command detected from gateway
    openOverlay(command, args);
  }, [openOverlay]);

  const showHelp = useCallback(() => {
    const commands = getCommandDefs();
    const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join("\n");
    toast(helpText, { duration: 8000 });
  }, []);

  const handleExport = useCallback((_format: string) => {
    // Export functionality — existing logic
    toast("导出功能开发中...");
  }, []);

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
      />
      <OfflineBanner />
      <NudgeToastListener
        onOpenTodos={() => setActiveOverlay("todos")}
        onOpenTodayTodo={() => setActiveOverlay("today-todo")}
        onOpenBriefing={() => setActiveOverlay("morning-briefing")}
        onOpenSummary={() => setActiveOverlay("evening-summary")}
      />

      <NewHeader
        onSearchClick={() => setActiveOverlay("search")}
        onAvatarClick={() => setShowSidebar(true)}
        onInsightClick={() => setActiveOverlay("review")}
        onTodosClick={() => setActiveOverlay("todos")}
      />

      <main className="pb-6">
        <NotesTimeline onNoteClick={(id) => setDetailId(id)} />
      </main>

      <FAB
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
      {detailId && (
        <NoteDetail recordId={detailId} onClose={() => setDetailId(null)} />
      )}
      {activeOverlay === "search" && (
        <SearchView
          onClose={closeOverlay}
          onNoteClick={(id) => {
            closeOverlay();
            setDetailId(id);
          }}
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
        onNoteClick={(id) => {
          closeOverlay();
          setDetailId(id);
        }}
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
      {activeOverlay === "morning-briefing" && (
        <MorningBriefing onClose={closeOverlay} />
      )}
      {activeOverlay === "evening-summary" && (
        <EveningSummary onClose={closeOverlay} />
      )}
    </div>
  );
}
