"use client";

import { WifiOff } from "lucide-react";
import { useNetwork } from "@/hooks/use-network";

export function OfflineBanner() {
  const { online } = useNetwork();

  if (online) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-xs font-medium">
      <WifiOff className="w-3.5 h-3.5" />
      <span>当前离线 — 录音将在联网后自动上传</span>
    </div>
  );
}
