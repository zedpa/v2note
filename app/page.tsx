"use client";

import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { NotesGrid } from "@/components/notes-grid";
import { TodoView } from "@/components/todo-view";
import { ProfileView } from "@/components/profile-view";
import { BottomNav, type TabKey } from "@/components/bottom-nav";
import { NoteDetail } from "@/components/note-detail";
import { SearchView } from "@/components/search-view";
import { OfflineBanner } from "@/components/offline-banner";
import { useNotes } from "@/hooks/use-notes";
import { useTodos } from "@/hooks/use-todos";

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabKey>("notes");
  const [activeFilter, setActiveFilter] = useState("全部");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const { notes } = useNotes();
  const { todos } = useTodos();

  const completedNotes = notes.filter((n) => n.status === "completed");
  const profileStats = [
    { label: "笔记", value: String(completedNotes.length) },
    { label: "录音", value: String(notes.length) },
    { label: "待办", value: String(todos.filter((t) => !t.done).length) },
  ];

  return (
    <div className="min-h-dvh bg-background max-w-lg mx-auto relative">
      <OfflineBanner />

      <AppHeader
        activeTab={activeTab}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onSearchClick={() => setShowSearch(true)}
      />

      <main className="pb-44">
        {activeTab === "notes" && (
          <NotesGrid
            activeFilter={activeFilter}
            onNoteClick={(id) => setDetailId(id)}
          />
        )}
        {activeTab === "todos" && <TodoView />}
        {activeTab === "profile" && <ProfileView stats={profileStats} />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />

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
    </div>
  );
}
