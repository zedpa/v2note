"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import type { UpdateInfo } from "../lib/updater";

interface UpdateDialogProps {
  update: UpdateInfo | null;
  onDismiss: () => void;
  applying: boolean;
}

export function UpdateDialog({ update, onDismiss, applying }: UpdateDialogProps) {
  if (applying) {
    return (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full text-sm shadow-lg animate-pulse">
        正在更新...
      </div>
    );
  }

  if (!update) return null;

  const handleDownload = async () => {
    try {
      const { openApkDownload } = await import("../lib/updater");
      await openApkDownload(update.bundleUrl);
    } catch {
      window.open(update.bundleUrl, "_blank");
    }
  };

  return (
    <AlertDialog open={!!update} onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>发现新版本 v{update.version}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {update.changelog && (
                <p className="whitespace-pre-wrap">{update.changelog}</p>
              )}
              {update.fileSize && (
                <p className="text-xs text-muted-foreground">
                  大小: {(update.fileSize / 1024 / 1024).toFixed(1)} MB
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!update.isMandatory && (
            <AlertDialogCancel onClick={onDismiss}>稍后</AlertDialogCancel>
          )}
          <AlertDialogAction onClick={handleDownload}>立即下载</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
