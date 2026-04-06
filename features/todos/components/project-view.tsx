"use client";

import { useState, useCallback, useMemo } from "react";
import type { ProjectGroup, TodoDTO } from "../lib/todo-types";
import { getProjectColor } from "../lib/project-colors";
import { ProjectCard } from "./project-card";
import { TodoCreateSheet } from "./todo-create-sheet";
import { ProjectDetailSheet } from "./project-detail-sheet";

interface ProjectViewProps {
  projectGroups: ProjectGroup[];
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onCreate: (params: {
    text: string;
    scheduled_start?: string;
    estimated_minutes?: number;
    priority?: number;
    parent_id?: string;
  }) => Promise<any>;
  onPostpone: (id: string) => void;
  onRemove: (id: string) => void;
  swipeOpenId: string | null;
  onSwipeOpenChange: (id: string | null) => void;
  projects?: TodoDTO[];
}

export function ProjectView({
  projectGroups,
  onToggle,
  onPress,
  onCreate,
  onPostpone,
  onRemove,
  swipeOpenId,
  onSwipeOpenChange,
  projects,
}: ProjectViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [detailGroup, setDetailGroup] = useState<ProjectGroup | null>(null);
  const [detailColorIndex, setDetailColorIndex] = useState(0);

  const handleAdd = useCallback((parentId?: string) => {
    setCreateParentId(parentId);
    // 先关闭详情页，避免 z-index 层叠导致创建面板被遮挡
    setDetailGroup(null);
    setCreateOpen(true);
  }, []);

  const handleHeaderPress = useCallback(
    (group: ProjectGroup, colorIndex: number) => {
      setDetailGroup(group);
      setDetailColorIndex(colorIndex);
    },
    [],
  );

  // 瀑布流：将卡片分配到左右两列，短列优先
  const { leftColumn, rightColumn } = useMemo(() => {
    const left: { group: ProjectGroup; colorIndex: number }[] = [];
    const right: { group: ProjectGroup; colorIndex: number }[] = [];
    let leftHeight = 0;
    let rightHeight = 0;

    projectGroups.forEach((group, i) => {
      // 估算卡片高度：头部 + 待办行数 + 底部
      const pendingRows = Math.min(group.tasks.filter(t => !t.done).length, 5);
      const estimatedHeight = 48 + pendingRows * 32 + 48;

      if (leftHeight <= rightHeight) {
        left.push({ group, colorIndex: i });
        leftHeight += estimatedHeight;
      } else {
        right.push({ group, colorIndex: i });
        rightHeight += estimatedHeight;
      }
    });

    return { leftColumn: left, rightColumn: right };
  }, [projectGroups]);

  if (projectGroups.length === 0) {
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
    <div data-testid="project-view" className="flex flex-col px-4 pb-24">
      {/* 瀑布流双列 */}
      <div className="flex gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          {leftColumn.map(({ group, colorIndex }) => (
            <ProjectCard
              key={group.project?.id ?? "inbox"}
              group={group}
              color={getProjectColor(colorIndex)}
              onToggle={onToggle}
              onPress={onPress}
              onAdd={handleAdd}
              onPostpone={onPostpone}
              onRemove={onRemove}
              swipeOpenId={swipeOpenId}
              onSwipeOpenChange={onSwipeOpenChange}
              onHeaderPress={() => handleHeaderPress(group, colorIndex)}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          {rightColumn.map(({ group, colorIndex }) => (
            <ProjectCard
              key={group.project?.id ?? "inbox"}
              group={group}
              color={getProjectColor(colorIndex)}
              onToggle={onToggle}
              onPress={onPress}
              onAdd={handleAdd}
              onPostpone={onPostpone}
              onRemove={onRemove}
              swipeOpenId={swipeOpenId}
              onSwipeOpenChange={onSwipeOpenChange}
              onHeaderPress={() => handleHeaderPress(group, colorIndex)}
            />
          ))}
        </div>
      </div>

      <TodoCreateSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={onCreate}
        defaultParentId={createParentId}
        projects={projects}
      />

      <ProjectDetailSheet
        group={detailGroup}
        color={getProjectColor(detailColorIndex)}
        open={detailGroup !== null}
        onClose={() => setDetailGroup(null)}
        onToggle={onToggle}
        onPress={onPress}
        onAdd={handleAdd}
        onPostpone={onPostpone}
        onRemove={onRemove}
        swipeOpenId={swipeOpenId}
        onSwipeOpenChange={onSwipeOpenChange}
      />
    </div>
  );
}
