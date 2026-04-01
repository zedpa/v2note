"use client";

import { useState, useCallback, useRef, type TouchEvent } from "react";
import type { ProjectGroup, TodoDTO } from "../lib/todo-types";
import { ProjectCard } from "./project-card";
import { PageDots } from "./page-dots";
import { TodoCreateSheet } from "./todo-create-sheet";

interface ProjectViewProps {
  projectGroups: ProjectGroup[];
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onCreate: (params: {
    text: string;
    parent_id?: string;
  }) => Promise<any>;
}

export function ProjectView({
  projectGroups,
  onToggle,
  onPress,
  onCreate,
}: ProjectViewProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const total = projectGroups.length;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const page = Math.round(el.scrollLeft / el.clientWidth);
    setCurrentPage(Math.min(page, total - 1));
  }, [total]);

  // 水平滑动时阻止事件冒泡，避免被外层 SwipeBack 拦截
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const handleCarouselTouchStart = useCallback((e: TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);
  const handleCarouselTouchMove = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x);
    const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    // 水平位移大于垂直 → 用户在横滑，阻止冒泡
    if (dx > dy && dx > 10) {
      e.stopPropagation();
    }
  }, []);

  const handleAdd = useCallback((parentId?: string) => {
    setCreateParentId(parentId);
    setCreateOpen(true);
  }, []);

  if (total === 0) {
    return (
      <div data-testid="project-view" className="flex flex-col items-center justify-center px-5 py-20 text-center">
        <div className="mb-2 text-lg text-foreground">还没有项目</div>
        <div className="text-sm text-muted-foreground">
          录一条语音，路路会帮你整理待办
        </div>
      </div>
    );
  }

  return (
    <div data-testid="project-view" className="flex flex-col">
      {/* 水平轮播 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleCarouselTouchStart}
        onTouchMove={handleCarouselTouchMove}
        className="flex snap-x snap-mandatory overflow-x-auto scrollbar-hide"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {projectGroups.map((group, i) => (
          <div
            key={group.project?.id ?? "inbox"}
            className="w-full flex-shrink-0 snap-center"
            style={{ minWidth: "100%" }}
          >
            <ProjectCard
              group={group}
              onToggle={onToggle}
              onPress={onPress}
              onAdd={handleAdd}
            />
          </div>
        ))}
      </div>

      {/* PageDots */}
      <PageDots total={total} current={currentPage} />

      {/* 底部留白 */}
      <div className="h-24" />

      <TodoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreate}
        defaultParentId={createParentId}
      />
    </div>
  );
}
