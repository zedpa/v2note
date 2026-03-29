"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Mic, CheckSquare, Percent, Flame } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { cn } from "@/lib/utils";
import { useDetailedStats } from "../hooks/use-detailed-stats";
import { fetchCognitiveStats, type CognitiveStats } from "@/shared/lib/api/cognitive";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SwipeBack } from "@/shared/components/swipe-back";

interface StatsDashboardProps {
  onClose: () => void;
}

const recordChartConfig: ChartConfig = {
  count: { label: "录音数", color: "hsl(var(--primary))" },
};

const todoChartConfig: ChartConfig = {
  created: { label: "新建", color: "hsl(var(--primary))" },
  completed: { label: "完成", color: "hsl(142.1 76.2% 36.3%)" },
};

const tagChartConfig: ChartConfig = {
  count: { label: "使用次数", color: "hsl(var(--primary))" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 极性环形图配色
const POLARITY_COLORS: Record<string, string> = {
  perceive: "#7BA3C4", // sky
  realize: "#C8845C",  // deer
  intend: "#5C7A5E",   // forest
  judge: "#E8A87C",    // dawn
};
const POLARITY_LABELS: Record<string, string> = {
  perceive: "感知",
  realize: "领悟",
  intend: "意图",
  judge: "判断",
};

const polarityChartConfig: ChartConfig = {
  perceive: { label: "感知", color: "#7BA3C4" },
  realize: { label: "领悟", color: "#C8845C" },
  intend: { label: "意图", color: "#5C7A5E" },
  judge: { label: "判断", color: "#E8A87C" },
};

export function StatsDashboard({ onClose }: StatsDashboardProps) {
  const stats = useDetailedStats();
  const [cogStats, setCogStats] = useState<CognitiveStats | null>(null);

  useEffect(() => {
    fetchCognitiveStats().then(setCogStats).catch(() => {});
  }, []);

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">统计概览</h1>
        </div>

        <ScrollArea className="flex-1">
        <div className="max-w-lg mx-auto p-4 space-y-6">
          {stats.loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-surface-low rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !cogStats || cogStats.total_strikes === 0 ? (
            /* 空状态引导 — 无认知数据时 */
            <div className="flex flex-col items-center justify-center py-20">
              <Flame size={32} className="text-deer/30 mb-4" />
              <p className="font-serif text-lg text-muted-accessible">
                积累 5 条以上记录后
              </p>
              <p className="font-serif text-lg text-muted-accessible">
                AI 开始分析你的认知模式
              </p>
              <div className="mt-4 w-40">
                <div className="h-2 rounded-full bg-surface-high overflow-hidden">
                  <div
                    className="h-full rounded-full bg-deer/40 transition-all"
                    style={{ width: `${Math.min(((cogStats?.total_strikes ?? 0) / 5) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-accessible mt-1 text-center">
                  {cogStats?.total_strikes ?? 0} / 5
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* 极性分布环形图 */}
              {cogStats && cogStats.polarity_distribution && (
                <div className="rounded-xl bg-surface-lowest p-4 shadow-ambient">
                  <h3 className="text-sm font-medium text-on-surface mb-3">认知极性分布</h3>
                  <div className="flex items-center gap-4">
                    <ChartContainer config={polarityChartConfig} className="w-32 h-32">
                      <PieChart>
                        <Pie
                          data={Object.entries(cogStats.polarity_distribution)
                            .filter(([k]) => k !== "feel")
                            .map(([key, value]) => ({ name: key, value }))}
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={48}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {Object.entries(cogStats.polarity_distribution)
                            .filter(([k]) => k !== "feel")
                            .map(([key]) => (
                              <Cell key={key} fill={POLARITY_COLORS[key] || "#EBE8E2"} />
                            ))}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                    <div className="flex-1 space-y-2">
                      {Object.entries(cogStats.polarity_distribution)
                        .filter(([k]) => k !== "feel")
                        .map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: POLARITY_COLORS[key] }} />
                            <span className="text-xs text-on-surface">{POLARITY_LABELS[key] || key}</span>
                            <span className="text-xs text-muted-accessible ml-auto font-mono">{value}</span>
                          </div>
                        ))}
                      {cogStats.polarity_distribution.feel > 0 && (
                        <p className="text-[10px] text-muted-accessible mt-1">
                          感受类 {cogStats.polarity_distribution.feel} 条，仅存档
                        </p>
                      )}
                    </div>
                  </div>
                  {/* 三列摘要 */}
                  <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-ghost-border">
                    <div className="text-center">
                      <p className="font-serif text-lg text-on-surface">{cogStats.realize_lag_days}天</p>
                      <p className="text-[10px] text-muted-accessible">领悟滞后</p>
                    </div>
                    <div className="text-center">
                      <p className="font-serif text-lg text-on-surface">{cogStats.total_strikes}</p>
                      <p className="text-[10px] text-muted-accessible">认知总数</p>
                    </div>
                    <div className="text-center">
                      <p className="font-serif text-lg text-on-surface">{cogStats.contradiction_count}</p>
                      <p className="text-[10px] text-muted-accessible">矛盾数</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-3">
                <SummaryCard
                  icon={<Mic className="w-4 h-4 text-primary" />}
                  value={stats.totalRecords}
                  label="本周录音"
                />
                <SummaryCard
                  icon={<CheckSquare className="w-4 h-4 text-emerald-500" />}
                  value={stats.totalTodos}
                  label="本周待办"
                />
                <SummaryCard
                  icon={<Percent className="w-4 h-4 text-amber-500" />}
                  value={`${stats.completionRate}%`}
                  label="完成率"
                />
                <SummaryCard
                  icon={<Flame className="w-4 h-4 text-orange-500" />}
                  value={stats.streak}
                  label="连续天数"
                />
              </div>

              {/* Daily record trend */}
              {stats.dailyTrend.length > 0 && (
                <ChartSection title="录音趋势（近30天）">
                  <ChartContainer config={recordChartConfig} className="aspect-[2/1] w-full">
                    <BarChart data={stats.dailyTrend}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </ChartSection>
              )}

              {/* Todo trend */}
              {stats.todoTrend.length > 0 && (
                <ChartSection title="待办趋势（近30天）">
                  <ChartContainer config={todoChartConfig} className="aspect-[2/1] w-full">
                    <LineChart data={stats.todoTrend}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="date" tickFormatter={formatDate} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line type="monotone" dataKey="created" stroke="var(--color-created)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ChartContainer>
                </ChartSection>
              )}

              {/* Tag distribution */}
              {stats.tagDistribution.length > 0 && (
                <ChartSection title="标签分布（Top 10）">
                  <ChartContainer config={tagChartConfig} className="aspect-[2/1] w-full">
                    <BarChart data={stats.tagDistribution} layout="vertical">
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                      <XAxis type="number" allowDecimals={false} fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" fontSize={10} tickLine={false} axisLine={false} width={80} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                </ChartSection>
              )}
            </>
          )}
        </div>
      </ScrollArea>
      </div>
    </SwipeBack>
  );
}

function SummaryCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-surface-low">
      <div className="p-2 rounded-full bg-surface-lowest">{icon}</div>
      <div>
        <span className="text-xl font-bold text-on-surface">{value}</span>
        <span className="block text-[11px] text-muted-accessible">{label}</span>
      </div>
    </div>
  );
}

function ChartSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/40 p-4">
      <h3 className="text-sm font-medium text-on-surface mb-3">{title}</h3>
      {children}
    </div>
  );
}
