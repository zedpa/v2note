"use client";

import { useState, useEffect } from "react";
import {
  X,
  Moon,
  Sun,
  Bell,
  HelpCircle,
  Download,
  Star,
  ChevronRight,
  CheckSquare,
  Briefcase,
  Palette,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { ExportDialog } from "@/features/workspace/components/export-dialog";
import { TodoView } from "@/features/todos/components/todo-view";
import { SwipeBack } from "@/shared/components/swipe-back";
import { useNotes } from "@/features/notes/hooks/use-notes";
import { useTodos } from "@/features/todos/hooks/use-todos";
import { getUserType, setUserType } from "@/shared/lib/settings";
import type { UserType } from "@/shared/lib/types";

interface ProfileOverlayProps {
  onClose: () => void;
}

export function ProfileOverlay({ onClose }: ProfileOverlayProps) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const [showExport, setShowExport] = useState(false);
  const [showTodos, setShowTodos] = useState(false);
  const [userType, setUserTypeState] = useState<UserType>(null);

  useEffect(() => {
    getUserType().then(setUserTypeState);
  }, []);

  const handleUserType = async (type: UserType) => {
    const newType = userType === type ? null : type;
    setUserTypeState(newType);
    await setUserType(newType);
  };

  const { notes } = useNotes();
  const { todos } = useTodos();

  const completedNotes = notes.filter((n) => n.status === "completed");
  const pendingTodos = todos.filter((t) => !t.done);

  const stats = [
    { label: "笔记", value: String(completedNotes.length) },
    { label: "录音", value: String(notes.length) },
    { label: "待办", value: String(pendingTodos.length) },
  ];

  const toggleTheme = () => setTheme(isDark ? "light" : "dark");

  // Nested todo overlay
  if (showTodos) {
    return (
      <SwipeBack onClose={() => setShowTodos(false)}>
        <div className="max-w-lg mx-auto">
          <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 pt-safe">
            <div className="flex items-center justify-between px-4 pt-4 pb-3">
              <h1 className="text-lg font-bold text-foreground">待办事项</h1>
              <button
                type="button"
                onClick={() => setShowTodos(false)}
                className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
                aria-label="返回"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>
          <TodoView />
        </div>
      </SwipeBack>
    );
  }

  return (
    <SwipeBack onClose={onClose}>
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="sticky top-0 bg-background/80 backdrop-blur-xl z-10 pt-safe">
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <h1 className="text-lg font-bold text-foreground">我的</h1>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-secondary hover:bg-secondary/70 transition-colors"
              aria-label="关闭"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="px-4 pb-8">
          {/* User info */}
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-primary">V</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-foreground">VoiceNote</h2>
              <p className="text-xs text-muted-foreground mt-0.5">设备用户</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {stats.map((stat) => (
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
              <span className="text-xs font-medium text-foreground">
                免费额度
              </span>
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

          {/* User type selector */}
          <div className="p-4 rounded-2xl bg-card border border-border/50 mb-6">
            <p className="text-xs font-medium text-foreground mb-3">我的角色</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleUserType("manager")}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                  userType === "manager"
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:bg-secondary/50",
                )}
              >
                <Briefcase className={cn(
                  "w-5 h-5",
                  userType === "manager" ? "text-primary" : "text-muted-foreground",
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  userType === "manager" ? "text-primary" : "text-foreground",
                )}>管理者</span>
                <span className="text-[10px] text-muted-foreground">销售/区域经理</span>
              </button>
              <button
                type="button"
                onClick={() => handleUserType("creator")}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all",
                  userType === "creator"
                    ? "border-primary bg-primary/10"
                    : "border-border/50 hover:bg-secondary/50",
                )}
              >
                <Palette className={cn(
                  "w-5 h-5",
                  userType === "creator" ? "text-primary" : "text-muted-foreground",
                )} />
                <span className={cn(
                  "text-xs font-medium",
                  userType === "creator" ? "text-primary" : "text-foreground",
                )}>创作者</span>
                <span className="text-[10px] text-muted-foreground">写作/设计/音乐</span>
              </button>
            </div>
          </div>

          {/* Menu items */}
          <div className="space-y-1">
            {/* Todos entry */}
            <button
              type="button"
              onClick={() => setShowTodos(true)}
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-xl",
                "hover:bg-secondary/50 transition-colors text-left",
              )}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-secondary">
                <CheckSquare className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">待办事项</p>
                <p className="text-[10px] text-muted-foreground">
                  {pendingTodos.length} 项待办
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </button>

            {/* Dark mode toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                "flex items-center gap-3 w-full p-3 rounded-xl",
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

            {/* Notifications */}
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
                <p className="text-[10px] text-muted-foreground">
                  管理推送和提醒
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </button>

            {/* Export */}
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
                <p className="text-[10px] text-muted-foreground">
                  导出笔记和录音
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </button>

            {/* Rate */}
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
                <p className="text-[10px] text-muted-foreground">
                  在应用商店留下评价
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </button>

            {/* Help */}
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
                <p className="text-sm font-medium text-foreground">
                  帮助与反馈
                </p>
                <p className="text-[10px] text-muted-foreground">
                  常见问题和意见反馈
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
            </button>
          </div>
        </div>

        <ExportDialog
          open={showExport}
          onClose={() => setShowExport(false)}
        />
      </div>
    </SwipeBack>
  );
}
