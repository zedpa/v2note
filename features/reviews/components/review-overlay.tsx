"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useReviews } from "../hooks/use-reviews";
import { DateSelector } from "./date-selector";
import { ReviewResult } from "./review-result";
import { ReviewList } from "./review-list";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SwipeBack } from "@/shared/components/swipe-back";
import {
  getSkills,
  setSkills,
  type LocalSkillConfig,
} from "@/shared/lib/local-config";
import type { Review } from "@/shared/lib/types";

interface ReviewOverlayProps {
  onClose: () => void;
}

type Stage = "selecting" | "generating" | "viewing";

export function ReviewOverlay({ onClose }: ReviewOverlayProps) {
  const { reviews, generating, generateReview, loading } = useReviews();
  const [stage, setStage] = useState<Stage>("selecting");
  const [currentReview, setCurrentReview] = useState<Review | null>(null);
  const [lastParams, setLastParams] = useState<{
    period: Review["period"];
    start: string;
    end: string;
  } | null>(null);

  // Review skill selection
  const [reviewSkills, setReviewSkills] = useState<LocalSkillConfig[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>("");

  useEffect(() => {
    async function loadReviewSkills() {
      const local = await getSkills();
      if (local?.configs) {
        const reviews = local.configs.filter(
          (c) => c.type === "review" && c.enabled,
        );
        setReviewSkills(reviews);
        setSelectedSkill(local.selectedReviewSkill ?? "");
      }
    }
    loadReviewSkills();
  }, []);

  const handleSkillChange = async (value: string) => {
    setSelectedSkill(value);
    const local = await getSkills();
    if (local) {
      await setSkills({
        ...local,
        selectedReviewSkill: value || undefined,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleGenerate = async (
    period: Review["period"],
    start: string,
    end: string,
  ) => {
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
            {stage === "viewing" ? "复盘结果" : "复盘记录"}
          </h1>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-lg mx-auto p-4">
            {stage === "selecting" && (
              <div className="space-y-6">
                <DateSelector
                  onGenerate={handleGenerate}
                  generating={generating}
                />

                {/* Review skill selector */}
                {reviewSkills.length > 0 && (
                  <div className="border border-border/60 rounded-xl p-4">
                    <h3 className="text-sm font-medium mb-3">复盘视角</h3>
                    <RadioGroup
                      value={selectedSkill}
                      onValueChange={handleSkillChange}
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="" id="review-none" />
                        <label
                          htmlFor="review-none"
                          className="text-sm text-muted-foreground cursor-pointer"
                        >
                          无视角（默认对话）
                        </label>
                      </div>
                      {reviewSkills.map((skill) => (
                        <div
                          key={skill.name}
                          className="flex items-center gap-2"
                        >
                          <RadioGroupItem
                            value={skill.name}
                            id={`review-${skill.name}`}
                          />
                          <label
                            htmlFor={`review-${skill.name}`}
                            className="text-sm cursor-pointer"
                          >
                            {skill.name}
                            {skill.description && (
                              <span className="text-muted-foreground ml-1.5 text-xs">
                                {skill.description}
                              </span>
                            )}
                          </label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                )}

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
                <p className="text-sm text-muted-foreground">AI 正在生成复盘...</p>
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
