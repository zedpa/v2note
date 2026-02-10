"use client";

import { RecordButton } from "./record-button";

interface FloatingRecordButtonProps {
  onOpenTextEditor?: () => void;
}

export function FloatingRecordButton({ onOpenTextEditor }: FloatingRecordButtonProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pb-safe">
      <RecordButton onOpenTextEditor={onOpenTextEditor} />
    </div>
  );
}
