"use client";

import { useState } from "react";
import { Overlay } from "@/components/layout/overlay";

interface DailyReviewProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "morning" | "evening";

export function DailyReview({ isOpen, onClose }: DailyReviewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("morning");

  return (
    <Overlay isOpen={isOpen} onClose={onClose} mode="modal" title="每日回顾">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-sand/60 dark:bg-secondary/40 mb-5">
        <button
          type="button"
          onClick={() => setActiveTab("morning")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "morning"
              ? "bg-cream dark:bg-card text-bark dark:text-foreground shadow-sm"
              : "text-bark/50 dark:text-foreground/50 hover:text-bark dark:hover:text-foreground"
          }`}
        >
          ☀️ 晨间
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("evening")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === "evening"
              ? "bg-cream dark:bg-card text-bark dark:text-foreground shadow-sm"
              : "text-bark/50 dark:text-foreground/50 hover:text-bark dark:hover:text-foreground"
          }`}
        >
          🌙 晚间
        </button>
      </div>

      {activeTab === "morning" ? <MorningContent /> : <EveningContent />}
    </Overlay>
  );
}

/* ── Morning Tab ── */

function MorningContent() {
  // TODO: fetch from /action-panel API for today data
  const actions = [
    { id: "1", text: "整理项目文档", done: false },
    { id: "2", text: "回复待办邮件", done: false },
    { id: "3", text: "完成周报提交", done: true },
  ];

  return (
    <div className="space-y-5">
      {/* 今日行动 */}
      <Section title="今日行动">
        {actions.length === 0 ? (
          <p className="text-sm text-bark/40 dark:text-muted-foreground">
            暂无行动计划
          </p>
        ) : (
          <div className="space-y-2">
            {actions.map((action) => (
              <div
                key={action.id}
                className="flex items-center gap-2.5 py-1.5"
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    action.done
                      ? "border-primary bg-primary"
                      : "border-bark/20 dark:border-foreground/20"
                  }`}
                >
                  {action.done && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path
                        d="M2.5 5L4.5 7L7.5 3"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <span
                  className={`text-sm ${
                    action.done
                      ? "text-bark/40 dark:text-muted-foreground line-through"
                      : "text-bark dark:text-foreground"
                  }`}
                >
                  {action.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 路路的发现 */}
      <Section title="路路的发现">
        <p className="text-sm text-bark/40 dark:text-muted-foreground">
          暂无新洞察
        </p>
      </Section>
    </div>
  );
}

/* ── Evening Tab ── */

function EveningContent() {
  return (
    <div className="space-y-5">
      {/* 今日统计 */}
      <Section title="今日统计">
        <div className="flex items-center gap-4 text-sm text-bark/60 dark:text-muted-foreground">
          <span>X 条记录</span>
          <span className="text-bark/20 dark:text-foreground/20">·</span>
          <span>主要关注 XXX</span>
        </div>
      </Section>

      {/* 路路的发现 */}
      <Section title="路路的发现">
        <p className="text-sm text-bark/40 dark:text-muted-foreground">
          暂无新洞察
        </p>
      </Section>

      {/* 最有价值记录 */}
      <Section title="最有价值记录">
        <div className="rounded-lg bg-sand/40 dark:bg-secondary/30 p-3">
          <p className="text-sm text-bark/60 dark:text-muted-foreground italic">
            今天还没有产出记录哦，记下点什么吧 ✨
          </p>
        </div>
      </Section>

      {/* 情绪 */}
      <Section title="今日情绪">
        <div className="flex items-center gap-3">
          {["😊", "😐", "😔", "😤", "🤔"].map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="w-9 h-9 rounded-full bg-sand/50 dark:bg-secondary/40 hover:bg-sand dark:hover:bg-secondary flex items-center justify-center text-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>

      {/* 反思引导 */}
      <Section title="反思引导">
        <div className="border-2 border-dashed border-bark/15 dark:border-foreground/15 rounded-lg p-4">
          <p className="text-sm text-bark dark:text-foreground mb-3">
            今天有什么让你感到特别满足或困扰的事情吗？
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition-colors"
          >
            💬 想聊聊吗
          </button>
        </div>
      </Section>
    </div>
  );
}

/* ── Shared Section ── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-0.5 h-4 bg-primary rounded-full" />
        <h3 className="text-sm font-semibold text-bark dark:text-foreground">
          {title}
        </h3>
      </div>
      <div className="pl-3">{children}</div>
    </div>
  );
}
