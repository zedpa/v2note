"use client";

import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, BarChart3 } from "lucide-react";
import { useNotes } from "@/hooks/use-notes";
import { useReviews } from "@/hooks/use-reviews";
import { useNotesTree } from "@/hooks/use-notes-tree";
import type { TreeYear, TreeMonth, TreeWeek, TreeDay } from "@/hooks/use-notes-tree";
import type { NoteItem, Review } from "@/lib/types";
import { NoteCard } from "./note-card";
import type { Note } from "./note-card";
import { toast } from "sonner";

interface NotesTreeProps {
  activeFilter?: string;
  onNoteClick?: (noteId: string) => void;
}

/** Convert NoteItem → Note for NoteCard */
function toNote(item: NoteItem): Note {
  return {
    id: item.id,
    title: item.title,
    tags: item.tags,
    summary: item.short_summary,
    date: item.date,
    time: item.time,
    location: item.location ?? undefined,
    type: "diary",
    status: item.status,
  };
}

export function NotesTree({ activeFilter, onNoteClick }: NotesTreeProps) {
  const { notes, loading: notesLoading } = useNotes();
  const { reviewMap, loading: reviewsLoading, generating, generateReview } = useReviews();
  const { tree, isExpanded, toggleNode } = useNotesTree(
    notes,
    reviewMap,
    activeFilter,
  );

  const loading = notesLoading || reviewsLoading;

  const handleGenerate = useCallback(
    async (period: Review["period"], start: string, end: string) => {
      try {
        await generateReview(period, start, end);
        toast("盘点已生成");
      } catch (err: any) {
        toast.error(err.message ?? "生成失败");
      }
    },
    [generateReview],
  );

  if (loading) {
    return (
      <div className="px-4 space-y-3 pt-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl p-4 bg-card border border-border/60 animate-pulse">
            <div className="h-4 bg-secondary rounded w-3/4 mb-3" />
            <div className="h-3 bg-secondary rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <div className="w-12 h-12 rounded-full bg-secondary/60 flex items-center justify-center mb-3">
          <span className="text-lg">0</span>
        </div>
        <p className="text-sm">暂无笔记</p>
        <p className="text-xs mt-1">长按底部按钮开始录音</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-1 pb-4">
      {tree.map((yearNode) => (
        <YearNode
          key={yearNode.year}
          node={yearNode}
          isExpanded={isExpanded}
          toggleNode={toggleNode}
          onNoteClick={onNoteClick}
          onGenerate={handleGenerate}
          generating={generating}
        />
      ))}
    </div>
  );
}

// ── Section header: ● label ──────── ──

function SectionHeader({
  label,
  onClick,
  open,
}: {
  label: string;
  onClick: () => void;
  open: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 w-full py-2 text-left group"
    >
      <span className="text-[10px] text-primary">●</span>
      <span className="text-xs font-semibold text-foreground/80 whitespace-nowrap">{label}</span>
      <div className="flex-1 h-px bg-border/60" />
      {open ? (
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      ) : (
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

// ── Year ──

function YearNode({
  node,
  isExpanded,
  toggleNode,
  onNoteClick,
  onGenerate,
  generating,
}: {
  node: TreeYear;
  isExpanded: (key: string) => boolean;
  toggleNode: (key: string) => void;
  onNoteClick?: (noteId: string) => void;
  onGenerate: (period: Review["period"], start: string, end: string) => void;
  generating: boolean;
}) {
  const key = String(node.year);
  const open = isExpanded(key);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => toggleNode(key)}
        className="flex items-center gap-1.5 w-full py-2 text-left group"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-sm font-bold text-foreground">{node.year}年</span>
      </button>

      {open && (
        <>
          {node.months.map((m) => (
            <MonthNode
              key={m.month}
              node={m}
              year={node.year}
              isExpanded={isExpanded}
              toggleNode={toggleNode}
              onNoteClick={onNoteClick}
              onGenerate={onGenerate}
              generating={generating}
            />
          ))}
          <ReviewNode
            review={node.review}
            label="年盘点"
            onGenerate={() => onGenerate("yearly", `${node.year}-01-01`, `${node.year}-12-31`)}
            generating={generating}
          />
        </>
      )}
    </div>
  );
}

// ── Month ──

function MonthNode({
  node,
  year,
  isExpanded,
  toggleNode,
  onNoteClick,
  onGenerate,
  generating,
}: {
  node: TreeMonth;
  year: number;
  isExpanded: (key: string) => boolean;
  toggleNode: (key: string) => void;
  onNoteClick?: (noteId: string) => void;
  onGenerate: (period: Review["period"], start: string, end: string) => void;
  generating: boolean;
}) {
  const key = `${year}-${node.month}`;
  const open = isExpanded(key);

  const firstDay = new Date(year, node.month - 1, 1);
  const lastDay = new Date(year, node.month, 0);
  const mStart = formatDate(firstDay);
  const mEnd = formatDate(lastDay);

  return (
    <div className="mb-0.5">
      <SectionHeader
        label={`${node.month}月`}
        onClick={() => toggleNode(key)}
        open={open}
      />

      {open && (
        <>
          {node.weeks.map((w) => (
            <WeekNode
              key={w.weekNum}
              node={w}
              year={year}
              isExpanded={isExpanded}
              toggleNode={toggleNode}
              onNoteClick={onNoteClick}
              onGenerate={onGenerate}
              generating={generating}
            />
          ))}
          <ReviewNode
            review={node.review}
            label="月盘点"
            onGenerate={() => onGenerate("monthly", mStart, mEnd)}
            generating={generating}
          />
        </>
      )}
    </div>
  );
}

// ── Week (no title, just container) ──

function WeekNode({
  node,
  year,
  isExpanded,
  toggleNode,
  onNoteClick,
  onGenerate,
  generating,
}: {
  node: TreeWeek;
  year: number;
  isExpanded: (key: string) => boolean;
  toggleNode: (key: string) => void;
  onNoteClick?: (noteId: string) => void;
  onGenerate: (period: Review["period"], start: string, end: string) => void;
  generating: boolean;
}) {
  return (
    <>
      {node.days.map((d) => (
        <DayNode
          key={d.date}
          node={d}
          isExpanded={isExpanded}
          toggleNode={toggleNode}
          onNoteClick={onNoteClick}
          onGenerate={onGenerate}
          generating={generating}
        />
      ))}
      <ReviewNode
        review={node.review}
        label="周盘点"
        onGenerate={() => onGenerate("weekly", node.startDate, node.endDate)}
        generating={generating}
      />
    </>
  );
}

// ── Day ──

function DayNode({
  node,
  isExpanded,
  toggleNode,
  onNoteClick,
  onGenerate,
  generating,
}: {
  node: TreeDay;
  isExpanded: (key: string) => boolean;
  toggleNode: (key: string) => void;
  onNoteClick?: (noteId: string) => void;
  onGenerate: (period: Review["period"], start: string, end: string) => void;
  generating: boolean;
}) {
  const key = node.date;
  const open = isExpanded(key);

  return (
    <div className="mb-0.5">
      <SectionHeader
        label={`${node.dayOfMonth}日 周${node.weekday}`}
        onClick={() => toggleNode(key)}
        open={open}
      />

      {open && (
        <>
          {node.notes.map((note, i) => (
            <NoteCard
              key={note.id}
              note={toNote(note)}
              isLast={i === node.notes.length - 1 && !node.review}
              onClick={() => onNoteClick?.(note.id)}
            />
          ))}
          <ReviewNode
            review={node.review}
            label="日盘点"
            onGenerate={() => onGenerate("daily", node.date, node.date)}
            generating={generating}
          />
        </>
      )}
    </div>
  );
}

// ── Review node ──

function ReviewNode({
  review,
  label,
  onGenerate,
  generating,
}: {
  review?: Review;
  label: string;
  onGenerate: () => void;
  generating: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (review) {
    return (
      <div className="mb-1">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 w-full py-1.5 text-left hover:bg-primary/5 rounded-lg px-1.5 transition-colors"
        >
          <BarChart3 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <span className="text-xs font-medium text-primary">{label}</span>
          <span className="text-[10px] text-muted-foreground truncate flex-1 ml-1">
            {!expanded && review.summary?.slice(0, 30)}
            {!expanded && review.summary && review.summary.length > 30 && "..."}
          </span>
        </button>
        {expanded && review.summary && (
          <div className="mt-1 mb-2 p-2.5 rounded-lg bg-primary/5 text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
            {review.summary}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onGenerate}
      disabled={generating}
      className="flex items-center gap-1.5 py-1.5 mb-1 text-left hover:bg-secondary/40 rounded-lg px-1.5 transition-colors disabled:opacity-50"
    >
      <BarChart3 className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
      <span className="text-xs text-muted-foreground/60">
        {generating ? "生成中..." : `生成${label}`}
      </span>
    </button>
  );
}

// ── Helpers ──

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
