"use client";

import { Mic, CheckSquare, TrendingUp } from "lucide-react";
import { useStats } from "@/features/sidebar/hooks/use-stats";

interface StatsPanelProps {
  onViewDetails?: () => void;
}

export function StatsPanel({ onViewDetails }: StatsPanelProps) {
  const { totalRecords, totalTodos, completedTodos, loading } = useStats();

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-xl bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  const completionRate =
    totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;

  return (
    <div>
      <h3 className="font-serif text-sm text-on-surface mb-3">本周概览</h3>
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          icon={<Mic size={16} className="text-deer" />}
          value={totalRecords}
          label="记录"
        />
        <StatCard
          icon={<CheckSquare size={16} className="text-forest" />}
          value={`${completedTodos}/${totalTodos}`}
          label="待办"
        />
        <StatCard
          icon={<TrendingUp size={16} className="text-dawn" />}
          value={`${completionRate}%`}
          label="完成率"
        />
      </div>

      {onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="w-full mt-3 py-2 rounded-xl text-xs text-muted-accessible hover:bg-surface/60 transition-colors text-center"
        >
          查看详细统计 →
        </button>
      )}
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-lowest">
      {icon}
      <span className="text-base font-semibold text-on-surface">{value}</span>
      <span className="text-[10px] text-muted-accessible">{label}</span>
    </div>
  );
}
