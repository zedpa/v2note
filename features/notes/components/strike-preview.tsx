"use client";

import { useState } from "react";
import { Eye, Scale, Lightbulb, Target, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrikeView } from "@/shared/lib/api/strikes";

const POLARITY_CONFIG: Record<
  string,
  { icon: typeof Eye; color: string; label: string }
> = {
  perceive: { icon: Eye, color: "text-blue-500", label: "感知" },
  judge: { icon: Scale, color: "text-orange-500", label: "判断" },
  realize: { icon: Lightbulb, color: "text-purple-500", label: "领悟" },
  intend: { icon: Target, color: "text-green-500", label: "意图" },
  feel: { icon: Heart, color: "text-red-500", label: "感受" },
};

const POLARITY_OPTIONS = Object.keys(POLARITY_CONFIG);

interface StrikeRowProps {
  strike: StrikeView;
  onSave: (id: string, fields: { nucleus?: string; polarity?: string }) => Promise<void>;
}

function StrikeRow({ strike, onSave }: StrikeRowProps) {
  const [editing, setEditing] = useState(false);
  const [nucleus, setNucleus] = useState(strike.nucleus);
  const [polarity, setPolarity] = useState(strike.polarity);
  const [saving, setSaving] = useState(false);

  const config = POLARITY_CONFIG[strike.polarity] ?? POLARITY_CONFIG.perceive;
  const Icon = config.icon;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(strike.id, { nucleus, polarity });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-1.5">
        <select
          value={polarity}
          onChange={(e) => setPolarity(e.target.value as StrikeView["polarity"])}
          className="text-xs bg-secondary rounded px-1.5 py-1 border border-border"
        >
          {POLARITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {POLARITY_CONFIG[p].label}
            </option>
          ))}
        </select>
        <input
          value={nucleus}
          onChange={(e) => setNucleus(e.target.value)}
          className="flex-1 text-xs bg-secondary rounded px-2 py-1 border border-border"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="text-[10px] text-primary font-medium px-2 py-0.5 rounded bg-primary/10"
        >
          {saving ? "..." : "保存"}
        </button>
        <button
          type="button"
          onClick={() => {
            setNucleus(strike.nucleus);
            setPolarity(strike.polarity);
            setEditing(false);
          }}
          className="text-[10px] text-muted-foreground px-1"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 py-1.5 w-full text-left hover:bg-secondary/50 rounded px-1 -mx-1 transition-colors"
    >
      <Icon className={cn("w-3.5 h-3.5 shrink-0", config.color)} />
      <span className="text-xs text-foreground flex-1 truncate">
        {strike.nucleus}
      </span>
      {/* Confidence dots */}
      <div className="flex gap-0.5">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              strike.confidence >= level * 0.33
                ? config.color.replace("text-", "bg-")
                : "bg-muted-foreground/20",
            )}
          />
        ))}
      </div>
    </button>
  );
}

interface StrikePreviewProps {
  strikes: StrikeView[];
  onUpdate: (id: string, fields: { nucleus?: string; polarity?: string }) => Promise<void>;
}

export function StrikePreview({ strikes, onUpdate }: StrikePreviewProps) {
  if (strikes.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground py-1">暂无认知记录</p>
    );
  }

  return (
    <div className="space-y-0.5">
      {strikes.map((s) => (
        <StrikeRow key={s.id} strike={s} onSave={onUpdate} />
      ))}
    </div>
  );
}

/** Build summary like "3 个感知 / 1 个判断 / 1 个意图" */
export function strikeSummaryText(strikes: StrikeView[]): string {
  const counts: Record<string, number> = {};
  for (const s of strikes) {
    const label = POLARITY_CONFIG[s.polarity]?.label ?? s.polarity;
    counts[label] = (counts[label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => `${count} 个${label}`)
    .join(" / ");
}
