"use client";

import { cn } from "@/lib/utils";
import { Flame } from "lucide-react";
import { getDomainStyle } from "@/features/todos/lib/domain-config";

interface ImpactDotsProps {
  impact: number;
  domain?: string;
}

/**
 * Impact visual indicator:
 * - 1-3 (low): nothing shown
 * - 4-6 (medium): small text label
 * - 7-8 (high): flame icon
 * - 9-10 (critical): pulsing flame + label
 */
export function ImpactDots({ impact, domain }: ImpactDotsProps) {
  if (impact <= 3) return null;

  if (impact <= 6) {
    return (
      <span className="text-[9px] font-mono text-muted-foreground/70 px-1">
        {impact}
      </span>
    );
  }

  const isCritical = impact >= 9;

  return (
    <div
      className={cn(
        "flex items-center gap-0.5",
        isCritical && "animate-pulse",
      )}
    >
      <Flame
        className={cn(
          "w-3 h-3",
          isCritical ? "text-orange-500" : "text-orange-400",
        )}
      />
      {isCritical && (
        <span className="text-[9px] font-semibold text-orange-500">
          {impact}
        </span>
      )}
    </div>
  );
}
