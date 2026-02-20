"use client";

import { BarChart3, CheckSquare, Mic, ChevronRight } from "lucide-react";
import { useStats } from "@/features/sidebar/hooks/use-stats";

interface StatsPanelProps {
  onViewDetails?: () => void;
}

export function StatsPanel({ onViewDetails }: StatsPanelProps) {
  const { totalRecords, totalTodos, completedTodos, loading } = useStats();

  if (loading) {
    return (
      <div className="p-4 animate-pulse">
        <div className="h-4 bg-secondary rounded w-24 mb-3" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-secondary rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-xs font-semibold text-muted-foreground mb-3">本周概览</h3>
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Mic className="w-4 h-4 text-primary" />}
          value={totalRecords}
          label="记录"
        />
        <StatCard
          icon={<CheckSquare className="w-4 h-4 text-emerald-500" />}
          value={`${completedTodos}/${totalTodos}`}
          label="待办完成"
        />
        <StatCard
          icon={<BarChart3 className="w-4 h-4 text-amber-500" />}
          value={totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0}
          label="完成率%"
        />
      </div>

      {onViewDetails && (
        <button
          type="button"
          onClick={onViewDetails}
          className="flex items-center justify-center gap-1 w-full mt-3 py-2 rounded-lg text-xs text-muted-foreground hover:bg-secondary/40 transition-colors"
        >
          查看详情
          <ChevronRight className="w-3 h-3" />
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
    <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-secondary/40">
      {icon}
      <span className="text-lg font-semibold text-foreground">{value}</span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
