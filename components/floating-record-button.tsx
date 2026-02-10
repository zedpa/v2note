"use client";

import { RecordButton } from "./record-button";

export function FloatingRecordButton() {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pb-safe">
      <RecordButton />
    </div>
  );
}
