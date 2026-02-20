"use client";

import { useState, useEffect } from "react";
import { initStatusBar } from "@/shared/lib/status-bar";
import { NewHeader } from "@/shared/components/new-header";
import { NotesTimeline } from "@/features/notes/components/notes-timeline";
import { TodoView } from "@/features/todos/components/todo-view";
import { IdeaView } from "@/features/ideas/components/idea-view";
import { FAB } from "@/features/recording/components/fab";
import { SidebarDrawer } from "@/features/sidebar/components/sidebar-drawer";
import { NoteDetail } from "@/features/notes/components/note-detail";
import { SearchView } from "@/features/search/components/search-view";
import { ChatView } from "@/features/chat/components/chat-view";
import { OfflineBanner } from "@/shared/components/offline-banner";
import { StatsDashboard } from "@/features/sidebar/components/stats-dashboard";
import { MemorySoulOverlay } from "@/features/memory/components/memory-soul-overlay";
import { ReviewOverlay } from "@/features/reviews/components/review-overlay";
import { useTags } from "@/features/tags/hooks/use-tags";

export default function Page() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeFilter, setActiveFilter] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [chatDateRange, setChatDateRange] = useState<{
    start: string;
    end: string;
  } | null>(null);

  const { tags, addTag, removeTag, isSystemTag } = useTags();

  useEffect(() => {
    initStatusBar();
  }, []);

  return (
    <div className="min-h-dvh bg-background max-w-lg mx-auto relative">
      <SidebarDrawer
        open={showSidebar}
        onClose={() => setShowSidebar(false)}
        onViewStats={() => setShowStats(true)}
        onViewMemory={() => setShowMemory(true)}
        onViewReview={() => setShowReview(true)}
      />
      <OfflineBanner />

      <NewHeader
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onSearchClick={() => setShowSearch(true)}
        onAvatarClick={() => setShowSidebar(true)}
        tags={tags}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        isSystemTag={isSystemTag}
      />

      <main className="pb-6">
        {activeFilter === "待办" ? (
          <TodoView />
        ) : activeFilter === "灵感" ? (
          <IdeaView onNoteClick={(id) => setDetailId(id)} />
        ) : (
          <NotesTimeline
            filter={activeFilter || undefined}
            onNoteClick={(id) => setDetailId(id)}
          />
        )}
      </main>

      <FAB
        onStartReview={(range) => {
          setChatDateRange(range);
          setShowChat(true);
        }}
      />

      {/* Overlays */}
      {detailId && (
        <NoteDetail recordId={detailId} onClose={() => setDetailId(null)} />
      )}
      {showSearch && (
        <SearchView
          onClose={() => setShowSearch(false)}
          onNoteClick={(id) => {
            setShowSearch(false);
            setDetailId(id);
          }}
        />
      )}
      {showChat && chatDateRange && (
        <ChatView
          dateRange={chatDateRange}
          onClose={() => setShowChat(false)}
        />
      )}
      {showStats && (
        <StatsDashboard onClose={() => setShowStats(false)} />
      )}
      {showMemory && (
        <MemorySoulOverlay onClose={() => setShowMemory(false)} />
      )}
      {showReview && (
        <ReviewOverlay onClose={() => setShowReview(false)} />
      )}
    </div>
  );
}
