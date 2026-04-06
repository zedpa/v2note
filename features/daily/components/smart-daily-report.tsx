"use client";

import { useState, useEffect, useCallback } from "react";
import { SwipeBack } from "@/shared/components/swipe-back";
import { Loader2, RefreshCw, CheckCircle2, Calendar } from "lucide-react";
import { api } from "@/shared/lib/api";
import { cn } from "@/lib/utils";

interface SmartDailyReportProps {
  onClose: () => void;
}

export function SmartDailyReport({ onClose }: SmartDailyReportProps) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async (forceRefresh?: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = forceRefresh ? "&refresh=true" : "";
      const data = await api.get<any>(`/api/v1/report?mode=auto${qs}`);
      setReport(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const now = new Date();
  const dayOfWeek = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const dateStr = `${now.getMonth() + 1}月${now.getDate()}日 周${dayOfWeek}`;
  const mode = report?.mode;

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh bg-surface pt-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-surface/80 backdrop-blur-[12px]">
          <h1 className="text-lg font-serif text-on-surface">
            {mode === "morning" ? "今日简报" : mode === "evening" ? "每日回顾" : "日报"}
          </h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-accessible">{dateStr}</span>
            <button
              type="button"
              onClick={() => fetchReport(true)}
              className="p-1.5 rounded-full hover:bg-surface-low transition-colors"
              disabled={loading}
            >
              <RefreshCw className={cn("w-4 h-4 text-muted-accessible", loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-surface-low transition-colors"
            >
              <span className="text-muted-accessible text-lg">&times;</span>
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && !report && (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-accessible" />
            <span className="ml-2 text-muted-accessible text-sm">正在生成...</span>
          </div>
        )}

        {/* Error */}
        {error && !report && (
          <div className="flex-1 flex items-center justify-center text-muted-accessible text-sm">
            <div className="text-center">
              <p>加载失败: {error}</p>
              <button type="button" onClick={() => fetchReport()} className="mt-2 text-deer underline">重试</button>
            </div>
          </div>
        )}

        {/* Content */}
        {report && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {/* Headline / Greeting */}
            {(report.headline || report.greeting) && (
              <p className="font-serif text-2xl text-on-surface leading-relaxed">
                {report.headline || report.greeting}
              </p>
            )}

            {/* Morning: Today Focus */}
            {mode === "morning" && report.today_focus?.length > 0 && (
              <Section title="今日重点">
                {report.today_focus.map((item: string, i: number) => (
                  <div key={i} className="flex items-start gap-2 py-1">
                    <span className="text-primary font-medium text-sm mt-0.5">{i + 1}.</span>
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Evening: Accomplishments */}
            {mode === "evening" && report.accomplishments?.length > 0 && (
              <Section title="完成">
                {report.accomplishments.map((item: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-forest shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Carry Over (morning) */}
            {mode === "morning" && report.carry_over?.length > 0 && (
              <Section title="遗留">
                {report.carry_over.map((item: string, i: number) => (
                  <p key={i} className="text-sm text-on-surface/70 py-0.5">{item}</p>
                ))}
              </Section>
            )}

            {/* Tomorrow Preview (evening) */}
            {mode === "evening" && report.tomorrow_preview?.length > 0 && (
              <Section title="明天">
                {report.tomorrow_preview.map((item: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <Calendar className="w-3.5 h-3.5 text-sky shrink-0" />
                    <span className="text-sm text-on-surface">{item}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Stats */}
            {report.stats && (
              <div className="pt-2 border-t border-border/30">
                <div className="flex items-center gap-3 text-xs text-muted-accessible">
                  {mode === "morning" && (
                    <span>{report.stats.yesterday_done ?? 0}/{report.stats.yesterday_total ?? 0} 昨日完成</span>
                  )}
                  {mode === "evening" && (
                    <>
                      <span>{report.stats.done ?? 0} 件完成</span>
                      <span>·</span>
                      <span>{report.stats.new_records ?? 0} 条记录</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* CTA */}
            <div className="pt-2 pb-4">
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-medium text-white"
                style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
              >
                {mode === "morning" ? "开始今天" : "晚安"}
              </button>
            </div>
          </div>
        )}
      </div>
    </SwipeBack>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1 h-4 bg-primary rounded-full" />
        <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  );
}
