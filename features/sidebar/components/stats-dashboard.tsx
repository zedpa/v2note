"use client";

import { ArrowLeft, Mic, CheckSquare, Percent, Flame } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";
import { useDetailedStats } from "../hooks/use-detailed-stats";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { ScrollArea } from "@/components/ui/scroll-area";

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

export function StatsDashboard({ onClose }: StatsDashboardProps) {
  const stats = useDetailedStats();

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
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
                <div key={i} className="h-32 bg-secondary/40 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : (
            <>
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
    <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/40">
      <div className="p-2 rounded-full bg-background">{icon}</div>
      <div>
        <span className="text-xl font-bold text-foreground">{value}</span>
        <span className="block text-[11px] text-muted-foreground">{label}</span>
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
    <div className="rounded-lg border border-border/60 p-4">
      <h3 className="text-sm font-medium text-foreground mb-3">{title}</h3>
      {children}
    </div>
  );
}
