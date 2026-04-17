"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { FeedbackSheet } from "./feedback-sheet";

/**
 * 浮动反馈按钮 — 固定在右下角，点击打开反馈抽屉
 */
export function FeedbackButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110 active:scale-95"
        aria-label="提交反馈"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>

      <FeedbackSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
