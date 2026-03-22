"use client";

import { useEffect, useState } from "react";
import {
  fetchActionPanel,
  type GoalIndicator,
} from "@/shared/lib/api/action-panel";
import { getDeviceId } from "@/shared/lib/device";

export default function GoalsPage() {
  const [goals, setGoals] = useState<GoalIndicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        await getDeviceId();
        const panel = await fetchActionPanel();
        setGoals(panel.goals);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-cream p-6">
      <h1 className="text-2xl font-bold mb-6">目标看板</h1>

      {loading && <p className="text-muted-foreground">加载中…</p>}
      {error && <p className="text-destructive">{error}</p>}

      {!loading && !error && goals.length === 0 && (
        <p className="text-muted-foreground">暂无目标</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {goals.map((goal) => (
          <div
            key={goal.goalId}
            className="rounded-xl bg-white p-5 shadow-sm border border-brand-border"
          >
            <h2 className="text-lg font-semibold">{goal.goalName}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {goal.actionCount} 项行动
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
