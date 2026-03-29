"use client";

import { useState, useCallback } from "react";
import {
  Factory,
  Banknote,
  Code,
  Stethoscope,
  Palette,
  GraduationCap,
  HardHat,
  ShoppingCart,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LuluLogo } from "@/components/brand/lulu-logo";
import type { LucideIcon } from "lucide-react";

export interface DomainSelectorProps {
  onSelect: (domains: string[]) => void;
  onSkip: () => void;
}

interface DomainOption {
  key: string;
  label: string;
  examples: string;
  icon: LucideIcon;
}

const PRESET_DOMAINS: DomainOption[] = [
  { key: "manufacturing", label: "制造/供应链", examples: "BOM、工序、良率", icon: Factory },
  { key: "finance", label: "金融/财务", examples: "ROI、对冲、现金流", icon: Banknote },
  { key: "tech", label: "科技/互联网", examples: "API、迭代、微服务", icon: Code },
  { key: "medical", label: "医疗/健康", examples: "诊断、处方、临床", icon: Stethoscope },
  { key: "design", label: "设计/创意", examples: "排版、色彩、用研", icon: Palette },
  { key: "education", label: "教育/学术", examples: "课纲、评估、论文", icon: GraduationCap },
  { key: "construction", label: "建筑/工程", examples: "施工、监理、预算", icon: HardHat },
  { key: "ecommerce", label: "电商/零售", examples: "SKU、转化率、选品", icon: ShoppingCart },
];

const MAX_SELECTION = 3;

export function DomainSelector({ onSelect, onSkip }: DomainSelectorProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleDomain = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < MAX_SELECTION) {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (selected.size === 0) return;
    onSelect([...selected]);
  }, [selected, onSelect]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col px-6 py-12">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        {/* 头部 */}
        <div className="flex items-center gap-3 mb-6">
          <LuluLogo size={40} variant="color" />
          <div>
            <h1 className="font-serif text-lg text-on-surface">路路</h1>
            <p className="text-xs text-muted-accessible font-mono">领域选择</p>
          </div>
        </div>

        {/* 提示文案 */}
        <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm bg-surface-low text-on-surface mb-6">
          路路想更了解你的工作，选一下你的领域吧
        </div>

        {/* 领域网格 */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {PRESET_DOMAINS.map((domain) => {
              const isSelected = selected.has(domain.key);
              const Icon = domain.icon;
              return (
                <button
                  key={domain.key}
                  type="button"
                  onClick={() => toggleDomain(domain.key)}
                  disabled={!isSelected && selected.size >= MAX_SELECTION}
                  className={cn(
                    "relative flex flex-col items-start gap-2 p-4 rounded-xl text-left transition-all",
                    "bg-surface-lowest shadow-ambient",
                    isSelected
                      ? "ring-2 ring-deer/60 bg-deer/5"
                      : "hover:bg-surface-low disabled:opacity-40",
                  )}
                >
                  {/* 选中角标 */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-deer flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <Icon
                    className={cn(
                      "w-6 h-6",
                      isSelected ? "text-deer" : "text-muted-accessible",
                    )}
                  />
                  <div>
                    <p className="font-serif text-sm text-on-surface">
                      {domain.label}
                    </p>
                    <p className="text-[10px] text-muted-accessible mt-0.5 leading-snug">
                      {domain.examples}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <p className="text-center text-xs text-muted-accessible mt-3">
              已选 {selected.size}/{MAX_SELECTION}
            </p>
          )}
        </div>

        {/* 底部操作 */}
        <div className="pt-6 space-y-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="w-full h-12 rounded-xl text-base font-medium text-white disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg, #89502C, #C8845C)" }}
          >
            确认
          </button>
          <div className="text-center">
            <button
              type="button"
              onClick={onSkip}
              className="text-xs text-muted-accessible/60 hover:text-muted-accessible transition-colors"
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
