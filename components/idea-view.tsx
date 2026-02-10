"use client";

import { Lightbulb } from "lucide-react";
import { useIdeas } from "@/hooks/use-ideas";

interface IdeaViewProps {
  onNoteClick?: (noteId: string) => void;
}

export function IdeaView({ onNoteClick }: IdeaViewProps) {
  const { ideas, loading } = useIdeas();

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold text-foreground">灵感</h2>
        <span className="text-xs text-muted-foreground">
          {ideas.length} 条灵感
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-xl bg-card border border-border/50 animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && ideas.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-3">
            <Lightbulb className="w-5 h-5" />
          </div>
          <p className="text-sm">暂无灵感</p>
          <p className="text-xs mt-1">录音中的创意想法会自动出现在这里</p>
        </div>
      )}

      {/* Ideas list */}
      {!loading && ideas.length > 0 && (
        <div className="space-y-2">
          {ideas.map((idea) => (
            <button
              type="button"
              key={idea.id}
              onClick={() => onNoteClick?.(idea.record_id)}
              className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-left hover:bg-amber-100/70 dark:hover:bg-amber-950/30 transition-colors"
            >
              <p className="text-sm text-foreground leading-snug">
                {idea.text}
              </p>
              {idea.source && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {"来自: "}
                  {idea.source}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
