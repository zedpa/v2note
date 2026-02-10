"use client";

import { useState } from "react";
import { X, Trash2, Archive, CheckSquare } from "lucide-react";

interface SelectionToolbarProps {
  selectedCount: number;
  onSelectAll: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onCancel: () => void;
}

export function SelectionToolbar({
  selectedCount,
  onSelectAll,
  onDelete,
  onArchive,
  onCancel,
}: SelectionToolbarProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <div className="sticky top-0 z-40 bg-primary text-primary-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onCancel} aria-label="取消选择">
            <X className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium">
            已选择 {selectedCount} 项
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
            aria-label="全选"
          >
            <CheckSquare className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
            aria-label="归档"
          >
            <Archive className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="p-2 rounded-lg hover:bg-primary-foreground/10 transition-colors"
            aria-label="删除"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-2xl p-6 mx-6 max-w-sm w-full shadow-xl">
            <h3 className="text-base font-semibold text-foreground mb-2">
              确认删除
            </h3>
            <p className="text-sm text-muted-foreground mb-5">
              将永久删除 {selectedCount} 条笔记及其录音、摘要等所有关联数据，此操作不可恢复。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-foreground text-sm font-medium hover:bg-secondary/70 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete();
                }}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
