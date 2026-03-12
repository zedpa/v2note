"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  updateNotebook,
  deleteNotebook,
  type Notebook,
} from "@/shared/lib/api/notebooks";
import { toast } from "sonner";

interface NotebookManagerProps {
  notebook: Notebook;
  position: { x: number; y: number };
  onClose: () => void;
  onRefresh: () => void;
}

export function NotebookManager({ notebook, position, onClose, onRefresh }: NotebookManagerProps) {
  const [mode, setMode] = useState<"menu" | "rename" | "confirm-delete">("menu");
  const [editName, setEditName] = useState(notebook.name);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  useEffect(() => {
    if (mode === "rename") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [mode]);

  // Calculate position — ensure it stays on screen
  const style: React.CSSProperties = {
    position: "fixed",
    zIndex: 60,
    left: Math.min(position.x, window.innerWidth - 200),
    top: Math.min(position.y, window.innerHeight - 160),
  };

  const handleRename = useCallback(async () => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateNotebook(notebook.id, { name });
      toast.success("已重命名");
      onRefresh();
      onClose();
    } catch {
      toast.error("重命名失败");
    }
  }, [notebook.id, editName, onRefresh, onClose]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteNotebook(notebook.id);
      toast.success("已删除");
      onRefresh();
      onClose();
    } catch {
      toast.error("删除失败");
    }
  }, [notebook.id, onRefresh, onClose]);

  return (
    <>
      {/* Transparent backdrop for click-away */}
      <div className="fixed inset-0 z-50" />

      <div
        ref={popoverRef}
        style={style}
        className="w-48 bg-background border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {mode === "menu" && (
          <div className="py-1">
            <button
              type="button"
              onClick={() => setMode("rename")}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-secondary/50 transition-colors text-left"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
              重命名
            </button>
            <button
              type="button"
              onClick={() => setMode("confirm-delete")}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-destructive/10 transition-colors text-left text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              删除
            </button>
          </div>
        )}

        {mode === "rename" && (
          <div className="p-3 space-y-2">
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") onClose(); }}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-border bg-background outline-none focus:ring-1 focus:ring-primary/40"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleRename}
                disabled={!editName.trim()}
                className="flex-1 text-xs py-1.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-40"
              >
                保存
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-xs py-1.5 rounded-lg text-muted-foreground hover:bg-secondary/60"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {mode === "confirm-delete" && (
          <div className="p-3 space-y-2">
            <p className="text-xs text-muted-foreground">确定删除「{notebook.name}」？此操作不可撤销。</p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 text-xs py-1.5 rounded-lg bg-destructive text-destructive-foreground font-medium"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-xs py-1.5 rounded-lg text-muted-foreground hover:bg-secondary/60"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
