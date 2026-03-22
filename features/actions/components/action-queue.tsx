"use client";

import { useState, useEffect } from "react";
import { Overlay } from "@/components/layout/overlay";
import {
  fetchActionPanel,
  type ActionItem,
} from "@/shared/lib/api/action-panel";

interface ActionQueueProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ActionQueue({ isOpen, onClose }: ActionQueueProps) {
  const [items, setItems] = useState<ActionItem[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    fetchActionPanel().then((panel) => setItems(panel.today));
  }, [isOpen]);

  return (
    <Overlay isOpen={isOpen} onClose={onClose} mode="sidebar" title="行动队列">
      <div className="space-y-1 bg-cream">
        {items.map((item, index) => (
          <div
            key={item.strikeId}
            className="flex items-center gap-2.5 py-2 text-sm text-bark"
          >
            <span
              className={`mt-0.5 w-2 h-2 shrink-0 rounded-full ${
                index === 0 ? "bg-sky" : "bg-bark/30"
              }`}
            />
            <span className="truncate">{item.text}</span>
          </div>
        ))}
      </div>
    </Overlay>
  );
}
