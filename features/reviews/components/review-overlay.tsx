"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  HelpCircle,
  Layers,
  TrendingUp,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReviews } from "../hooks/use-reviews";
import { DateSelector } from "./date-selector";
import { ReviewResult } from "./review-result";
import { ReviewList } from "./review-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SwipeBack } from "@/shared/components/swipe-back";
import { getSkills, setSkills } from "@/shared/lib/local-config";
import type { Review } from "@/shared/lib/types";

interface ReviewOverlayProps {
  onClose: () => void;
  onStartInsight?: (
    dateRange: { start: string; end: string },
    skillName: string,
  ) => void;
}

type Stage = "selecting" | "generating" | "viewing";

/** Built-in insight perspectives — matches gateway/insights/ directory */
const INSIGHT_SKILLS = [
  {
    name: "reflect",
    displayName: "苏格拉底追问",
    description: "对日记进行反思性提问，引导深度思考",
    icon: Sparkles,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-50 dark:bg-amber-950/40",
  },
  {
    name: "元问题视角",
    displayName: "元问题分析",
    description: "分析问题本质，找到真正需求",
    icon: HelpCircle,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
  },
  {
    name: "二阶思考视角",
    displayName: "二阶思考",
    description: "分析问题背后的深层问题，发现盲点",
    icon: Layers,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-50 dark:bg-violet-950/40",
  },
  {
    name: "munger-review",
    displayName: "芒格决策框架",
    description: "以查理·芒格的多元思维模型做跨期复盘",
    icon: TrendingUp,
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/40",
  },
] as const;

export function ReviewOverlay({
  onClose,
  onStartInsight,
}: ReviewOverlayProps) {
  const { reviews, generating, generateReview, loading } = useReviews();
  const [stage, setStage] = useState<Stage>("selecting");
  const [currentReview, setCurrentReview] = useState<Review | null>(null);
  const [lastParams, setLastParams] = useState<{
    period: Review["period"];
    start: string;
    end: string;
  } | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<string>("");

  const handleSkillSelect = async (name: string) => {
    const next = name === selectedSkill ? "" : name;
    setSelectedSkill(next);
    // Persist selected insight skill to local config for gateway
    const local = await getSkills();
    const updated = local ?? { configs: [], updatedAt: new Date().toISOString() };
    await setSkills({
      ...updated,
      selectedInsightSkill: next || undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleGenerate = async (
    period: Review["period"],
    start: string,
    end: string,
  ) => {
    if (selectedSkill && onStartInsight) {
      onStartInsight({ start, end }, selectedSkill);
      return;
    }

    setLastParams({ period, start, end });
    setStage("generating");
    try {
      const review = await generateReview(period, start, end);
      setCurrentReview(review);
      setStage("viewing");
    } catch {
      setStage("selecting");
    }
  };

  const handleRegenerate = async () => {
    if (!lastParams) return;
    setStage("generating");
    try {
      const review = await generateReview(
        lastParams.period,
        lastParams.start,
        lastParams.end,
      );
      setCurrentReview(review);
      setStage("viewing");
    } catch {
      setStage("viewing");
    }
  };

  const handleSelectHistory = (review: Review) => {
    setCurrentReview(review);
    setLastParams({
      period: review.period,
      start: review.period_start,
      end: review.period_end,
    });
    setStage("viewing");
  };

  const handleBack = () => {
    if (stage === "viewing") {
      setStage("selecting");
      setCurrentReview(null);
    } else {
      onClose();
    }
  };

  return (
    <SwipeBack onClose={onClose}>
      <div className="flex flex-col min-h-dvh pt-safe">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-full hover:bg-secondary/60 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">
            {stage === "viewing" ? "复盘结果" : "洞察复盘"}
          </h1>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-lg mx-auto p-4">
            {stage === "selecting" && (
              <div className="space-y-6">
                {/* Insight skill list */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    选择洞察视角
                  </p>
                  <div className="space-y-2">
                    {INSIGHT_SKILLS.map((skill) => {
                      const Icon = skill.icon;
                      const isSelected = selectedSkill === skill.name;
                      return (
                        <button
                          key={skill.name}
                          type="button"
                          onClick={() => handleSkillSelect(skill.name)}
                          className={cn(
                            "w-full flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left",
                            isSelected
                              ? "border-primary/40 bg-primary/5 shadow-sm"
                              : "border-border/60 hover:border-border hover:bg-secondary/30",
                          )}
                        >
                          <div
                            className={cn(
                              "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                              skill.bgColor,
                            )}
                          >
                            <Icon className={cn("w-4.5 h-4.5", skill.color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {skill.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                              {skill.description}
                            </p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                              <Check className="w-3 h-3 text-primary-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {!selectedSkill && (
                    <p className="text-[11px] text-muted-foreground/60 mt-2 px-1">
                      不选择视角将生成默认复盘报告
                    </p>
                  )}
                </div>

                {/* Date range selector */}
                <DateSelector
                  onGenerate={handleGenerate}
                  generating={generating}
                  insightSelected={!!selectedSkill}
                />

                {/* History */}
                {!loading && (
                  <ReviewList
                    reviews={reviews}
                    onSelect={handleSelectHistory}
                  />
                )}
              </div>
            )}

            {stage === "generating" && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  AI 正在生成复盘...
                </p>
              </div>
            )}

            {stage === "viewing" && currentReview && (
              <ReviewResult
                review={currentReview}
                onRegenerate={handleRegenerate}
                generating={generating}
              />
            )}
          </div>
        </ScrollArea>
      </div>
    </SwipeBack>
  );
}
