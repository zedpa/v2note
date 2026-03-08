"use client";

import { cn } from "@/lib/utils";
import { getDomainStyle } from "@/features/todos/lib/domain-config";

interface ImpactDotsProps {
  impact: number;
  domain?: string;
}

export function ImpactDots({ impact, domain }: ImpactDotsProps) {
  const filled = Math.ceil(impact / 2);
  const { fgStyle } = getDomainStyle(domain);
  const isHighImpact = impact >= 9;

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-1.5 rounded-full transition-all",
            i < filled ? "opacity-100" : "opacity-20",
            isHighImpact && i < filled && "animate-impact-pulse",
          )}
          style={{
            backgroundColor: i < filled
              ? fgStyle.color
              : `hsl(var(--muted-foreground) / 0.3)`,
            animationDelay: isHighImpact ? `${i * 100}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}
