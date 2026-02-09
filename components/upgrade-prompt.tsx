"use client";

import { Sparkles, X } from "lucide-react";

interface UpgradePromptProps {
  message: string;
  onDismiss: () => void;
}

export function UpgradePrompt({ message, onDismiss }: UpgradePromptProps) {
  return (
    <div className="mx-4 mb-4 p-4 rounded-2xl bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20">
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 flex-shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground mb-1">
            升级到 VoiceNote Pro
          </p>
          <p className="text-xs text-muted-foreground">
            {message}
          </p>
          <button
            type="button"
            className="mt-3 px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium"
          >
            了解更多
          </button>
        </div>
        <button type="button" onClick={onDismiss} className="p-1">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
