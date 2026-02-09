"use client";

import { BookOpen, CheckSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { RecordButton } from "./record-button";

export type TabKey = "notes" | "todos" | "profile";

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
}

const TABS: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
  { key: "notes", label: "笔记", icon: BookOpen },
  { key: "todos", label: "待办", icon: CheckSquare },
  { key: "profile", label: "我的", icon: User },
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 max-w-lg mx-auto">
      {/* Floating Record Button - absolute center above nav */}
      <div className="absolute left-1/2 -translate-x-1/2 -top-14 z-50">
        <RecordButton />
      </div>

      {/* Nav bar */}
      <nav className="bg-card/80 backdrop-blur-xl border-t border-border/50 pb-safe">
        <div className="grid grid-cols-3 items-end px-6 pt-2 pb-2">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors",
                activeTab === tab.key
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <tab.icon
                className={cn(
                  "w-5 h-5 transition-all",
                  activeTab === tab.key && "scale-110",
                )}
              />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
