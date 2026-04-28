"use client";

/**
 * 未知捕获路径的降级处理 — /capture/*（非 voice/text）
 *
 * Spec #131 验收行为 5: 未知 capture 路径静默降级 → 重定向主页
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CaptureUnknownPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return null;
}
