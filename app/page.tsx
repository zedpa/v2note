"use client";

import { useState, useEffect } from "react";
import { initStatusBar } from "@/lib/status-bar";
import { NewHeader } from "@/components/new-header";
import { NotesGrid } from "@/components/notes-grid";
import { TodoView } from "@/components/todo-view";
import { IdeaView } from "@/components/idea-view";
import { WeeklyReviewView } from "@/components/weekly-review-view";
import { FloatingRecordButton } from "@/components/floating-record-button";
import { ProfileOverlay } from "@/components/profile-overlay";
import { NoteDetail } from "@/components/note-detail";
import { SearchView } from "@/components/search-view";
import { TextEditor } from "@/components/text-editor";
import { OfflineBanner } from "@/components/offline-banner";
import { useTags } from "@/hooks/use-tags";

export default function Page() {
  const [activeFilter, setActiveFilter] = useState("全部");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showTextEditor, setShowTextEditor] = useState(false);

  const { tags } = useTags();

  useEffect(() => {
    initStatusBar();
  }, []);

  return (
    <div className="min-h-dvh bg-background max-w-lg mx-auto relative">
      <OfflineBanner />

      <NewHeader
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        onSearchClick={() => setShowSearch(true)}
        onAvatarClick={() => setShowProfile(true)}
        tags={tags}
      />

      <main className="pb-32">
        {activeFilter === "待办" ? (
          <TodoView />
        ) : activeFilter === "灵感" ? (
          <IdeaView onNoteClick={(id) => setDetailId(id)} />
        ) : activeFilter === "周盘" ? (
          <WeeklyReviewView />
        ) : (
          <NotesGrid
            activeFilter={activeFilter}
            onNoteClick={(id) => setDetailId(id)}
          />
        )}
      </main>

      <FloatingRecordButton onOpenTextEditor={() => setShowTextEditor(true)} />

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
      {showProfile && (
        <ProfileOverlay onClose={() => setShowProfile(false)} />
      )}
      {showTextEditor && (
        <TextEditor onClose={() => setShowTextEditor(false)} />
      )}
    </div>
  );
}
