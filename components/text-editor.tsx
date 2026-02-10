"use client";

import { useState } from "react";
import { X, Sparkles, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { createManualNote } from "@/lib/manual-note";
import { toast } from "sonner";

interface TextEditorProps {
  onClose: () => void;
}

export function TextEditor({ onClose }: TextEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const addTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async (useAi: boolean) => {
    if (!content.trim()) {
      toast.error("请输入内容");
      return;
    }

    try {
      setSaving(true);
      await createManualNote({
        title: title.trim(),
        content: content.trim(),
        tags: tags.length > 0 ? tags : undefined,
        useAi,
      });
      toast(useAi ? "笔记已创建，AI 正在分析..." : "笔记已创建");
      onClose();
    } catch (err: any) {
      toast.error(`保存失败: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 sticky top-0 bg-background/80 backdrop-blur-xl z-10 border-b border-border/50">
          <h1 className="text-lg font-bold text-foreground">新建笔记</h1>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
            aria-label="关闭"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Title */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可选）"
            className="w-full px-3 py-2.5 rounded-xl bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />

          {/* Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你的想法..."
            rows={10}
            className="w-full px-3 py-2.5 rounded-xl bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none leading-relaxed"
          />

          {/* Tags */}
          <div>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder="添加标签..."
                className="flex-1 px-3 py-2 rounded-xl bg-secondary text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              <button
                type="button"
                onClick={addTag}
                className="px-3 py-2 rounded-xl bg-secondary text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                添加
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => removeTag(tag)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    {tag} &times;
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={saving}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors",
                "bg-secondary text-foreground hover:bg-secondary/70",
                saving && "opacity-50 pointer-events-none",
              )}
            >
              <Send className="w-4 h-4" />
              直接保存
            </button>
            <button
              type="button"
              onClick={() => handleSave(true)}
              disabled={saving}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-colors",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                saving && "opacity-50 pointer-events-none",
              )}
            >
              <Sparkles className="w-4 h-4" />
              AI 分析
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
