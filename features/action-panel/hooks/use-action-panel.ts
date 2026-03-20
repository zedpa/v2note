"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getDeviceId } from "@/shared/lib/device";
import {
  fetchActionPanel,
  type ActionPanel,
  type ActionCard,
  type ActionItem,
} from "@/shared/lib/api/action-panel";

export function useActionPanel() {
  const [panel, setPanel] = useState<ActionPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentGoalIndex, setCurrentGoalIndex] = useState(0);

  const fetchPanel = useCallback(async () => {
    try {
      setLoading(true);
      await getDeviceId();
      const data = await fetchActionPanel();
      setPanel(data);
      setCurrentGoalIndex(0);
      setError(null);
      // Write link hint for cognitive map
      if (data.now) {
        localStorage.setItem(
          "v2note:lastLinkHint",
          `当前聚焦：${data.now.goalName} → ${data.now.action}`,
        );
        window.dispatchEvent(new Event("v2note:linkHintUpdated"));
      } else if (data.goals.length > 0) {
        const g = data.goals[0];
        localStorage.setItem(
          "v2note:lastLinkHint",
          `${g.goalName}：${g.actionCount} 项待办`,
        );
        window.dispatchEvent(new Event("v2note:linkHintUpdated"));
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to load action panel");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPanel();
  }, [fetchPanel]);

  const switchGoal = useCallback(
    (index: number) => {
      if (!panel) return;
      if (index >= 0 && index < panel.goals.length) {
        setCurrentGoalIndex(index);
      }
    },
    [panel],
  );

  const currentGoal = panel?.goals[currentGoalIndex] ?? null;

  const filteredToday: ActionItem[] = useMemo(() => {
    if (!panel || !currentGoal) return panel?.today ?? [];
    return panel.today.filter((item) => item.goalName === currentGoal.goalName);
  }, [panel, currentGoal]);

  return {
    now: panel?.now ?? null,
    today: filteredToday,
    goals: panel?.goals ?? [],
    currentGoalIndex,
    currentGoal,
    loading,
    error,
    switchGoal,
    refetch: fetchPanel,
  };
}
