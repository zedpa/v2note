"use client";

import { useState, useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface ConfirmOptions {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type ResolveFunc = (value: boolean) => void;

/**
 * 命令式确认对话框 hook，替代浏览器原生 confirm()
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   const ok = await confirm({ description: "确定删除？" });
 *   // 在 JSX 中渲染 <ConfirmDialog />
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions>({
    description: "",
  });
  const resolveRef = useRef<ResolveFunc | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleResult = useCallback((result: boolean) => {
    setOpen(false);
    resolveRef.current?.(result);
    resolveRef.current = null;
  }, []);

  const ConfirmDialog = useCallback(
    () => (
      <AlertDialog open={open} onOpenChange={(v) => !v && handleResult(false)}>
        <AlertDialogContent className="max-w-[320px] rounded-2xl">
          <AlertDialogHeader>
            {options.title ? (
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
            ) : (
              <VisuallyHidden>
                <AlertDialogTitle>确认</AlertDialogTitle>
              </VisuallyHidden>
            )}
            <AlertDialogDescription className={!options.title ? "pt-2" : ""}>
              {options.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row gap-2 sm:gap-2">
            <AlertDialogCancel
              className="flex-1 mt-0"
              onClick={() => handleResult(false)}
            >
              {options.cancelText || "取消"}
            </AlertDialogCancel>
            <AlertDialogAction
              className={`flex-1 ${options.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}`}
              onClick={() => handleResult(true)}
            >
              {options.confirmText || "确定"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [open, options, handleResult],
  );

  return { confirm, ConfirmDialog };
}
