"use client";

import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import type { ProjectGroup, TodoDTO } from "../lib/todo-types";
import type { ProjectColor } from "../lib/project-colors";
import { SwipeableTaskItem } from "./swipeable-task-item";
import { AddTaskRow } from "./add-task-row";

interface ProjectDetailSheetProps {
  group: ProjectGroup | null;
  color: ProjectColor;
  open: boolean;
  onClose: () => void;
  onToggle: (id: string) => void;
  onPress: (todo: TodoDTO) => void;
  onAdd: (parentId?: string) => void;
  onPostpone: (id: string) => void;
  onRemove: (id: string) => void;
  swipeOpenId: string | null;
  onSwipeOpenChange: (id: string | null) => void;
}

export function ProjectDetailSheet({
  group,
  color,
  open,
  onClose,
  onToggle,
  onPress,
  onAdd,
  onPostpone,
  onRemove,
  swipeOpenId,
  onSwipeOpenChange,
}: ProjectDetailSheetProps) {
  if (!group) return null;

  const title = group.isInbox ? "收集箱" : group.project?.text ?? "未命名";
  const pending = group.tasks.filter((t) => !t.done);
  const completed = group.tasks.filter((t) => t.done);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>项目待办详情</SheetDescription>
        </SheetHeader>

        {/* 带颜色的头部（Sheet 自带关闭按钮，不需要额外的 ×） */}
        <div className={`px-5 py-4 ${color.bg}`}>
          <div className={`text-base font-semibold ${color.text}`}>{title}</div>
          <div className={`text-xs ${color.text} opacity-70`}>
            {group.doneCount}/{group.tasks.length} 已完成
          </div>
        </div>

        {/* 待办列表 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {pending.map((todo) => (
            <SwipeableTaskItem
              key={todo.id}
              todo={todo}
              onToggle={onToggle}
              onPress={onPress}
              onPostpone={onPostpone}
              onRemove={onRemove}
              openId={swipeOpenId}
              onOpenChange={onSwipeOpenChange}
            />
          ))}

          {/* 添加待办 */}
          <div className="py-2">
            <AddTaskRow onAdd={() => onAdd(group.project?.id)} />
          </div>

          {/* 已完成区域 */}
          {completed.length > 0 && (
            <>
              <div className="pt-2 text-xs text-muted-foreground">
                {completed.length} 条已完成
              </div>
              {completed.map((todo) => (
                <SwipeableTaskItem
                  key={todo.id}
                  todo={todo}
                  onToggle={onToggle}
                  onPress={onPress}
                  onPostpone={onPostpone}
                  onRemove={onRemove}
                  openId={swipeOpenId}
                  onOpenChange={onSwipeOpenChange}
                />
              ))}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
