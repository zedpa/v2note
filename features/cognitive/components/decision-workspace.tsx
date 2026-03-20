"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { api } from "@/shared/lib/api";

interface DecisionWorkspaceProps {
  question: string;
  isOpen: boolean;
  onClose: () => void;
  onChat?: () => void;
}

interface DecisionSection {
  type: "support" | "oppose" | "gap" | "pattern";
  items: string[];
}

function parseSections(text: string): DecisionSection[] {
  const sections: DecisionSection[] = [];
  const lines = text.split("\n");

  let current: DecisionSection | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/支持|赞成|有利/)) {
      current = { type: "support", items: [] };
      sections.push(current);
    } else if (trimmed.match(/反对|不利|风险/)) {
      current = { type: "oppose", items: [] };
      sections.push(current);
    } else if (trimmed.match(/缺口|盲区|缺失|不足/)) {
      current = { type: "gap", items: [] };
      sections.push(current);
    } else if (trimmed.match(/模式|习惯|倾向/)) {
      current = { type: "pattern", items: [] };
      sections.push(current);
    } else if (current && (trimmed.startsWith("-") || trimmed.startsWith("•") || trimmed.match(/^\d+\./))) {
      current.items.push(trimmed.replace(/^[-•\d.]\s*/, ""));
    } else if (current && trimmed.length > 0 && !trimmed.startsWith("#")) {
      current.items.push(trimmed);
    }
  }
  return sections;
}

const SECTION_STYLES: Record<string, { border: string; bg: string; label: string }> = {
  support: { border: "border-l-green-500", bg: "bg-green-50 dark:bg-green-950/20", label: "支持论据" },
  oppose: { border: "border-l-red-500", bg: "bg-red-50 dark:bg-red-950/20", label: "反对论据" },
  gap: { border: "border-l-amber-500", bg: "bg-amber-50 dark:bg-amber-950/20", label: "信息缺口" },
  pattern: { border: "border-l-purple-500", bg: "bg-purple-50 dark:bg-purple-950/20", label: "你的思维模式" },
};

export function DecisionWorkspace({ question, isOpen, onClose, onChat }: DecisionWorkspaceProps) {
  const [analysis, setAnalysis] = useState<string>("");
  const [sections, setSections] = useState<DecisionSection[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !question) return;

    setLoading(true);
    setAnalysis("");
    setSections([]);

    // Call decision endpoint
    api
      .post<{ content: string }>("/api/v1/chat/decision", {
        question,
      })
      .then((res) => {
        setAnalysis(res.content);
        setSections(parseSections(res.content));
      })
      .catch((err) => {
        setAnalysis(`分析失败: ${err.message}`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, question]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
        <button type="button" onClick={onClose} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold line-clamp-1">{question}</h2>
      </div>

      <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">正在从你的认知图谱中寻找线索...</p>
          </div>
        ) : sections.length > 0 ? (
          <>
            {sections.map((section, i) => {
              const style = SECTION_STYLES[section.type] ?? SECTION_STYLES.support;
              return (
                <div
                  key={i}
                  className={`border-l-4 ${style.border} ${style.bg} rounded-r-xl p-4`}
                >
                  <h3 className="text-sm font-medium mb-2">{style.label}</h3>
                  <ul className="space-y-1.5">
                    {section.items.map((item, j) => (
                      <li key={j} className="text-sm text-foreground">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        ) : analysis ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <p className="text-sm whitespace-pre-wrap">{analysis}</p>
          </div>
        ) : null}

        {/* Continue chat button */}
        {!loading && (
          <button
            type="button"
            onClick={onChat}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 text-primary font-medium"
          >
            <MessageCircle className="w-4 h-4" />
            继续和 AI 讨论这个问题
          </button>
        )}
      </div>
    </div>
  );
}
