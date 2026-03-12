"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Plus, MoreVertical, Mic, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { SwipeBack } from "@/shared/components/swipe-back";
import { toast } from "sonner";
import {
  listNotebooks,
  createNotebook,
  type Notebook,
} from "@/shared/lib/api/notebooks";
import { NotebookManager } from "./notebook-manager";

const PRESET_COLORS = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#06b6d4", // cyan
  "#6366f1", // indigo (default)
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#78716c", // stone
];

const LABEL_MAP: Record<string, string> = {
  "ai-self": "AI 工作日志",
  default: "日常日记",
};

interface NotebookListProps {
  onClose: () => void;
  onSelect: (notebookName: string | null, color?: string) => void;
  activeNotebook: string | null;
}

export function NotebookList({ onClose, onSelect, activeNotebook }: NotebookListProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[4]);
  const [creating, setCreating] = useState(false);

  // Manager popover state
  const [managingNotebook, setManagingNotebook] = useState<Notebook | null>(null);
  const [managerPos, setManagerPos] = useState<{ x: number; y: number } | null>(null);

  const createInputRef = useRef<HTMLInputElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const loadNotebooks = useCallback(() => {
    setLoading(true);
    listNotebooks()
      .then(setNotebooks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadNotebooks(); }, [loadNotebooks]);

  useEffect(() => {
    if (showCreate) {
      setTimeout(() => {
        createInputRef.current?.focus();
        listEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [showCreate]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await createNotebook(name, undefined, newColor);
      setNewName("");
      setNewColor(PRESET_COLORS[4]);
      setShowCreate(false);
      toast.success("笔记本已创建");
      loadNotebooks();
    } catch (err) {
      console.error("创建笔记本失败:", err);
      toast.error("创建失败，请检查 Gateway 连接");
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, creating, loadNotebooks]);

  const handleSelect = useCallback((name: string | null, color?: string) => {
    onSelect(name, color);
    onClose();
  }, [onSelect, onClose]);

  const openManager = useCallback((nb: Notebook, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setManagerPos({ x: rect.left, y: rect.bottom + 4 });
    setManagingNotebook(nb);
  }, []);

  return (
    <SwipeBack onClose={onClose}>
      <div className="min-h-dvh bg-background flex flex-col pt-safe">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">笔记本</h1>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-1">
              {/* Voice notes — always first */}
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all text-left",
                  activeNotebook === null
                    ? "bg-foreground/5 ring-1 ring-foreground/10"
                    : "hover:bg-secondary/40",
                )}
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Mic className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">语音笔记</p>
                  <p className="text-xs text-muted-foreground/60">录音、转写、AI 处理</p>
                </div>
              </button>

              {/* Notebooks */}
              {notebooks.map((nb) => {
                const displayName = LABEL_MAP[nb.name] ?? nb.name;
                const isActive = activeNotebook === nb.name;

                return (
                  <div
                    key={nb.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all",
                      isActive
                        ? "bg-foreground/5 ring-1 ring-foreground/10"
                        : "hover:bg-secondary/40",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelect(nb.name, nb.color)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
                        style={{ backgroundColor: nb.color + "20" }}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full"
                          style={{ backgroundColor: nb.color }}
                        />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{displayName}</p>
                          {nb.is_system && (
                            <Shield className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          )}
                        </div>
                        {nb.description && (
                          <p className="text-xs text-muted-foreground/60 truncate">{nb.description}</p>
                        )}
                      </div>
                    </button>

                    {/* Actions — only for non-system notebooks */}
                    {!nb.is_system && (
                      <button
                        type="button"
                        onClick={(e) => openManager(nb, e)}
                        className="p-2 rounded-lg hover:bg-secondary/60 transition-colors shrink-0"
                      >
                        <MoreVertical className="w-4 h-4 text-muted-foreground/50" />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Inline create form */}
              {showCreate && (
                <div className="px-4 py-3 rounded-xl bg-secondary/30 space-y-3">
                  <input
                    ref={createInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="笔记本名称..."
                    className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40"
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  />

                  {/* Color picker */}
                  <div className="flex items-center gap-2">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewColor(c)}
                        className={cn(
                          "w-7 h-7 rounded-full transition-all",
                          newColor === c && "ring-2 ring-offset-2 ring-offset-background ring-foreground/30",
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!newName.trim() || creating}
                      className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
                    >
                      创建
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCreate(false); setNewName(""); }}
                      className="px-4 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-secondary/60"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              <div ref={listEndRef} />
            </div>
          )}
        </div>

        {/* FAB — create */}
        {!showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center mb-safe z-10"
          >
            <Plus className="w-6 h-6" />
          </button>
        )}

        {/* Manager popover */}
        {managingNotebook && managerPos && (
          <NotebookManager
            notebook={managingNotebook}
            position={managerPos}
            onClose={() => { setManagingNotebook(null); setManagerPos(null); }}
            onRefresh={loadNotebooks}
          />
        )}
      </div>
    </SwipeBack>
  );
}
