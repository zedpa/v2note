"use client";

import { useState } from "react";
import {
  Settings,
  ChevronRight,
  Moon,
  Sun,
  Bell,
  HelpCircle,
  Download,
  Star,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ExportDialog } from "./export-dialog";

const STATS_DEFAULT = [
  { label: "笔记", value: "0" },
  { label: "录音", value: "0" },
  { label: "待办", value: "0" },
];

interface ProfileViewProps {
  stats?: { label: string; value: string }[];
}

export function ProfileView({ stats }: ProfileViewProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const [showExport, setShowExport] = useState(false);

  const displayStats = stats ?? STATS_DEFAULT;

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="px-4 pb-4">
      {/* User info */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <span className="text-2xl font-bold text-primary">V</span>
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">VoiceNote</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            设备用户
          </p>
        </div>
        <button
          type="button"
          className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
          aria-label="设置"
        >
          <Settings className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {displayStats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center p-3 rounded-2xl bg-card border border-border/50"
          >
            <span className="text-xl font-bold text-foreground">
              {stat.value}
            </span>
            <span className="text-[10px] text-muted-foreground mt-1">
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Storage */}
      <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-foreground">免费额度</span>
          <span className="text-[10px] text-muted-foreground">
            30 录音/月 · 10 AI 摘要/月
          </span>
        </div>
        <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: "0%" }}
          />
        </div>
      </div>

      {/* Dark mode toggle */}
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          "flex items-center gap-3 w-full p-3 rounded-xl mb-1",
          "hover:bg-secondary/50 transition-colors text-left",
        )}
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
          {isDark ? (
            <Sun className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {isDark ? "浅色模式" : "深色模式"}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isDark ? "切换到浅色主题" : "切换到深色主题"}
          </p>
        </div>
        <div
          className={cn(
            "w-10 h-6 rounded-full transition-colors relative",
            isDark ? "bg-primary" : "bg-secondary",
          )}
        >
          <div
            className={cn(
              "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
              isDark ? "translate-x-5" : "translate-x-1",
            )}
          />
        </div>
      </button>

      {/* Menu */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => {}}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-xl",
            "hover:bg-secondary/50 transition-colors text-left",
          )}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
            <Bell className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">通知设置</p>
            <p className="text-[10px] text-muted-foreground">管理推送和提醒</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>

        <button
          type="button"
          onClick={() => setShowExport(true)}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-xl",
            "hover:bg-secondary/50 transition-colors text-left",
          )}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
            <Download className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">数据导出</p>
            <p className="text-[10px] text-muted-foreground">导出笔记和录音</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>

        <button
          type="button"
          onClick={() => {}}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-xl",
            "hover:bg-secondary/50 transition-colors text-left",
          )}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
            <Star className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">评价我们</p>
            <p className="text-[10px] text-muted-foreground">在应用商店留下评价</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>

        <button
          type="button"
          onClick={() => {}}
          className={cn(
            "flex items-center gap-3 w-full p-3 rounded-xl",
            "hover:bg-secondary/50 transition-colors text-left",
          )}
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">帮助与反馈</p>
            <p className="text-[10px] text-muted-foreground">常见问题和意见反馈</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
        </button>
      </div>

      <ExportDialog open={showExport} onClose={() => setShowExport(false)} />
    </div>
  );
}
