"use client";

import { X, HelpCircle, Download, CreditCard, Info, Brain, FileText, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsPanel } from "./stats-panel";
import { getCommandDefs } from "@/features/commands/lib/registry";
import { toast } from "sonner";

interface SidebarDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewStats?: () => void;
  onViewMemory?: () => void;
  onViewReview?: () => void;
  onViewProfile?: () => void;
  onExportData?: () => void;
}

export function SidebarDrawer({
  open,
  onClose,
  onViewStats,
  onViewMemory,
  onViewReview,
  onViewProfile,
  onExportData,
}: SidebarDrawerProps) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 z-50 w-72 bg-background border-r border-border",
          "flex flex-col pt-safe",
          "animate-in slide-in-from-left duration-300",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-lg">🎙</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">VoiceNote</p>
              <p className="text-[10px] text-muted-foreground">AI 个人助手</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Stats */}
          <StatsPanel onViewDetails={onViewStats ? () => { onClose(); onViewStats(); } : undefined} />

          <div className="h-px bg-border/60 mx-4" />

          {/* Menu items */}
          <div className="p-4 space-y-1">
            {onViewProfile && (
              <MenuItem
                icon={<UserCircle className="w-4 h-4" />}
                label="个人画像"
                onClick={() => { onClose(); onViewProfile(); }}
              />
            )}
            {onViewMemory && (
              <MenuItem
                icon={<Brain className="w-4 h-4" />}
                label="AI 记忆"
                onClick={() => { onClose(); onViewMemory(); }}
              />
            )}
            {onViewReview && (
              <MenuItem
                icon={<FileText className="w-4 h-4" />}
                label="复盘记录"
                onClick={() => { onClose(); onViewReview(); }}
              />
            )}
            <MenuItem
              icon={<HelpCircle className="w-4 h-4" />}
              label="命令帮助"
              onClick={() => {
                onClose();
                const commands = getCommandDefs();
                const helpText = commands.map((c) => `/${c.name} — ${c.description}`).join("\n");
                toast(helpText, { duration: 8000 });
              }}
            />
            <MenuItem
              icon={<Download className="w-4 h-4" />}
              label="导出数据"
              onClick={() => {
                onClose();
                if (onExportData) {
                  onExportData();
                } else {
                  toast("导出功能开发中...");
                }
              }}
            />
            <MenuItem
              icon={<CreditCard className="w-4 h-4" />}
              label="订阅状态"
              onClick={() => {
                onClose();
                toast("当前为免费版本", { duration: 3000 });
              }}
            />
            <MenuItem
              icon={<Info className="w-4 h-4" />}
              label="关于"
              onClick={() => {
                onClose();
                toast("VoiceNote v2 — AI 个人助手", { duration: 3000 });
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors text-left"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-sm text-foreground">{label}</span>
    </button>
  );
}
