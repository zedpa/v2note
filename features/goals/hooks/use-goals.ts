"use client";

import { useState, useEffect, useCallback } from "react";
import {
  listGoals,
  createGoal,
  updateGoal,
  confirmGoal,
  archiveGoal,
  triggerAutoLink,
} from "@/shared/lib/api/goals";
import type { Goal } from "@/shared/lib/types";

export function useGoals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await listGoals();
      setGoals(data);
    } catch {
      // 静默
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 按层级分组：项目（顶层）、目标（有 parent）、suggested
  const projects = goals.filter((g) => !g.parent_id && g.status !== "suggested" && g.status !== "dismissed");
  const suggested = goals.filter((g) => g.status === "suggested");

  const getChildren = useCallback(
    (parentId: string) => goals.filter((g) => g.parent_id === parentId),
    [goals],
  );

  const create = useCallback(
    async (title: string, parentId?: string) => {
      const goal = await createGoal({ title, parent_id: parentId, source: "manual" });
      // 触发自动关联（异步，不阻塞）
      triggerAutoLink(goal.id).catch(() => {});
      await refresh();
      return goal;
    },
    [refresh],
  );

  const confirm = useCallback(
    async (goalId: string) => {
      await confirmGoal(goalId);
      await refresh();
    },
    [refresh],
  );

  const dismiss = useCallback(
    async (goalId: string) => {
      await updateGoal(goalId, { status: "dismissed" });
      await refresh();
    },
    [refresh],
  );

  const archive = useCallback(
    async (goalId: string) => {
      await archiveGoal(goalId);
      await refresh();
    },
    [refresh],
  );

  const rename = useCallback(
    async (goalId: string, title: string) => {
      await updateGoal(goalId, { title });
      await refresh();
    },
    [refresh],
  );

  return {
    goals,
    projects,
    suggested,
    loading,
    getChildren,
    create,
    confirm,
    dismiss,
    archive,
    rename,
    refresh,
  };
}
