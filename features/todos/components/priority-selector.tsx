"use client";

export interface PriorityOption {
  value: number;
  label: string;
  /** 选中时的背景色 */
  activeBg: string;
  /** 选中时的文字色 */
  activeText: string;
  /** 左边框色（色彩情绪） */
  borderAccent: string;
}

export const PRIORITY_OPTIONS: PriorityOption[] = [
  { value: 1, label: "低",  activeBg: "bg-secondary",                     activeText: "text-muted-foreground", borderAccent: "" },
  { value: 3, label: "中",  activeBg: "bg-blue-500/15",                   activeText: "text-blue-400",         borderAccent: "border-l-blue-500" },
  { value: 4, label: "高",  activeBg: "bg-orange-400/15",                 activeText: "text-orange-400",       borderAccent: "border-l-orange-400" },
  { value: 5, label: "紧急", activeBg: "bg-red-500/15",                    activeText: "text-red-400",          borderAccent: "border-l-red-500" },
];

interface PrioritySelectorProps {
  value: number;
  onChange: (value: number) => void;
}

export function PrioritySelector({ value, onChange }: PrioritySelectorProps) {
  return (
    <div className="flex items-center gap-2.5">
      {PRIORITY_OPTIONS.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-[20px] px-4 py-2 text-[13px] font-medium transition-all ${
              opt.borderAccent && !isActive ? `border-l-[3px] ${opt.borderAccent}` : ""
            } ${
              isActive
                ? `${opt.activeBg} ${opt.activeText} ${opt.borderAccent ? `border ${opt.borderAccent.replace("border-l-", "border-")}` : ""}`
                : "bg-muted/60 text-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** 将 priority 数值转为中文标签 */
export function priorityToLabel(priority: number | null): string {
  const opt = PRIORITY_OPTIONS.find((o) => o.value === priority);
  return opt?.label ?? "中";
}
