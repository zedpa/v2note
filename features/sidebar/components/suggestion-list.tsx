"use client";

import { useEffect } from "react";
import { X, Check } from "lucide-react";
import type { Suggestion } from "../hooks/use-suggestions";

export interface SuggestionListProps {
  suggestions: Suggestion[];
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}

/** 建议类型对应的图标 */
const typeIcons: Record<string, string> = {
  split: "\u2702\uFE0F",   // 剪刀
  merge: "\uD83D\uDD17",   // 链接
  rename: "\u270F\uFE0F",  // 铅笔
  archive: "\uD83D\uDCE6", // 包裹
};

/** 获取建议的描述文本 */
function getSuggestionDescription(suggestion: Suggestion): string {
  const { payload } = suggestion;
  return payload?.reason ?? payload?.description ?? "AI 建议";
}

export function SuggestionList({
  suggestions,
  onAccept,
  onReject,
  onClose,
}: SuggestionListProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30" onClick={onClose} role="presentation">
      <div
        className="w-full max-w-lg bg-surface-high rounded-t-2xl p-5 max-h-[70vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="AI 建议"
      >
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-on-surface">AI 建议</h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface/60 transition-colors"
            aria-label="关闭"
          >
            <X size={18} className="text-muted-accessible" />
          </button>
        </div>

        {/* 建议列表 */}
        {suggestions.length === 0 ? (
          <p className="text-sm text-muted-accessible text-center py-8">暂无建议</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="flex items-start gap-3 p-3 rounded-xl bg-surface/60"
              >
                {/* 类型图标 */}
                <span className="text-lg shrink-0 mt-0.5" role="img" aria-label={s.suggestion_type}>
                  {typeIcons[s.suggestion_type] ?? "\uD83D\uDCA1"}
                </span>

                {/* 描述 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface">{getSuggestionDescription(s)}</p>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAccept(s.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors"
                    aria-label="接受建议"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(s.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                    aria-label="拒绝建议"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
