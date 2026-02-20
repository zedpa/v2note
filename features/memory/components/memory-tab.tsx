"use client";

import { useState } from "react";
import { Trash2, ChevronDown } from "lucide-react";
import { useMemory } from "../hooks/use-memory";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

function importanceColor(importance: number) {
  if (importance >= 9) return "bg-red-500";
  if (importance >= 7) return "bg-amber-500";
  if (importance >= 4) return "bg-blue-500";
  return "bg-muted-foreground/40";
}

export function MemoryTab() {
  const { memories, loading, hasMore, loadMore, deleteMemory } = useMemory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="p-4 space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-secondary rounded-lg" />
        ))}
      </div>
    );
  }

  if (memories.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        暂无记忆。AI 在处理您的录音时会自动提取和保存重要信息。
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-2">
        {memories.map((mem) => {
          const isExpanded = expandedId === mem.id;
          const isLong = mem.content.length > 100;

          return (
            <div
              key={mem.id}
              className="flex gap-2 rounded-lg border border-border/60 p-3"
            >
              {/* Importance bar */}
              <div
                className={cn(
                  "w-1 shrink-0 rounded-full",
                  importanceColor(mem.importance),
                )}
              />

              <div className="flex-1 min-w-0">
                <div
                  className={cn(
                    "text-sm text-foreground",
                    !isExpanded && isLong && "line-clamp-2",
                  )}
                >
                  {mem.content}
                </div>

                <div className="flex items-center gap-2 mt-2">
                  {mem.source_date && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {new Date(mem.source_date).toLocaleDateString("zh-CN")}
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    重要度: {mem.importance}
                  </span>

                  {isLong && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : mem.id)}
                      className="ml-auto p-0.5"
                    >
                      <ChevronDown
                        className={cn(
                          "w-3.5 h-3.5 text-muted-foreground transition-transform",
                          isExpanded && "rotate-180",
                        )}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Delete button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="p-1.5 shrink-0 self-start rounded hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>删除记忆</AlertDialogTitle>
                    <AlertDialogDescription>
                      确定要删除这条记忆吗？此操作无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={() => deleteMemory(mem.id)}>
                      删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        })}

        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={loadMore}
          >
            加载更多
          </Button>
        )}
      </div>
    </ScrollArea>
  );
}
