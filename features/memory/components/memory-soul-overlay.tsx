"use client";

import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SwipeBack } from "@/shared/components/swipe-back";
import { SoulTab } from "./soul-tab";
import { MemoryTab } from "./memory-tab";

interface MemorySoulOverlayProps {
  onClose: () => void;
}

export function MemorySoulOverlay({ onClose }: MemorySoulOverlayProps) {
  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">AI 记忆</h1>
        </div>

        <Tabs defaultValue="soul" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-3 grid grid-cols-2">
            <TabsTrigger value="soul">用户画像</TabsTrigger>
            <TabsTrigger value="memory">记忆列表</TabsTrigger>
          </TabsList>

          <TabsContent value="soul" className="flex-1 overflow-y-auto mt-0">
            <SoulTab />
          </TabsContent>

          <TabsContent value="memory" className="flex-1 overflow-hidden mt-0">
            <MemoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </SwipeBack>
  );
}
