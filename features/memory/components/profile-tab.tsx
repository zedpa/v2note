"use client";

import { useState } from "react";
import { Edit3, Save, X } from "lucide-react";
import { useProfile } from "../hooks/use-profile";
import { MarkdownContent } from "@/shared/components/markdown-content";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export function ProfileTab() {
  const { profile, loading, saving, updateProfile } = useProfile();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEditing = () => {
    setDraft(profile?.content ?? "");
    setEditing(true);
  };

  const handleSave = async () => {
    await updateProfile(draft);
    setEditing(false);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-4 animate-shimmer rounded w-32" />
        <div className="h-32 animate-shimmer rounded" style={{ animationDelay: "0.15s" }} />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg border border-border/60 p-4">
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              className="text-sm"
              placeholder="AI 从对话中提取的用户信息..."
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" />
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-medium text-foreground">用户画像</h3>
              <button
                type="button"
                onClick={startEditing}
                className="p-1.5 rounded hover:bg-secondary/60 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {profile?.content ? (
              <MarkdownContent className="text-muted-foreground">
                {profile.content}
              </MarkdownContent>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                AI 尚未建立您的用户画像。随着使用，AI 会自动了解您的基本信息和习惯。
              </p>
            )}
          </div>
        )}
      </div>

      {profile?.updated_at && (
        <p className="text-[10px] text-muted-foreground text-center">
          最后更新: {new Date(profile.updated_at).toLocaleString("zh-CN")}
        </p>
      )}
    </div>
  );
}
