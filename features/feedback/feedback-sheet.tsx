"use client";

import { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { api } from "@/shared/lib/api";
import { toast } from "sonner";

interface FeedbackSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES = [
  { value: "bug", label: "Bug / 异常" },
  { value: "feature", label: "功能建议" },
  { value: "question", label: "使用疑问" },
  { value: "other", label: "其他" },
];

/**
 * 反馈抽屉 — 用户填写描述 + 选择分类，自动收集平台信息
 */
export function FeedbackSheet({ open, onOpenChange }: FeedbackSheetProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("bug");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (description.trim().length < 5) {
      toast.error("请输入至少 5 个字的描述");
      return;
    }

    setSubmitting(true);
    try {
      const platform = detectPlatform();
      const logs = collectConsoleLogs();

      const result = await api.post<{ status: string; message: string }>("/api/v1/feedback", {
        description: description.trim(),
        category,
        platform,
        logs,
      });

      toast.success(result.message || "感谢反馈！");
      setDescription("");
      setCategory("bug");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>提交反馈</DrawerTitle>
          <DrawerDescription>
            告诉我们你遇到的问题或建议，我们会尽快处理
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 space-y-4">
          {/* 分类选择 */}
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setCategory(cat.value)}
                className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                  category === cat.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 描述输入 */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="请描述你遇到的问题或建议..."
            className="w-full min-h-[120px] rounded-lg border bg-background p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
            maxLength={2000}
            autoFocus
          />

          <p className="text-xs text-muted-foreground">
            提交时会自动附带平台和版本信息，帮助我们更快定位问题
          </p>
        </div>

        <DrawerFooter>
          <button
            onClick={handleSubmit}
            disabled={submitting || description.trim().length < 5}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 transition-opacity"
          >
            {submitting ? "提交中..." : "提交反馈"}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full rounded-lg py-2.5 text-sm text-muted-foreground"
          >
            取消
          </button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

/** 检测当前平台 */
function detectPlatform(): string {
  if (typeof window === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("electron")) return "electron";
  if (ua.includes("harmony")) return "harmony";
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  return "web";
}

/** 收集最近的 console 日志（简化版） */
function collectConsoleLogs(): string {
  // 浏览器环境下无法回溯 console 历史
  // 仅收集基础环境信息作为诊断数据
  if (typeof window === "undefined") return "";

  const info = [
    `Platform: ${detectPlatform()}`,
    `UserAgent: ${navigator.userAgent}`,
    `URL: ${window.location.href}`,
    `Screen: ${screen.width}x${screen.height}`,
    `Viewport: ${window.innerWidth}x${window.innerHeight}`,
    `Online: ${navigator.onLine}`,
    `Time: ${new Date().toISOString()}`,
  ];

  return info.join("\n");
}
