"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { getGatewayClient, type GatewayResponse } from "@/features/chat/lib/gateway-client";

interface NudgeAction {
  label: string;
  onClick: () => void;
}

/**
 * Hook that listens for proactive messages from the gateway
 * and displays them as toast notifications.
 */
export function useProactiveNudge(opts?: {
  onOpenTodos?: () => void;
  onOpenTodayTodo?: () => void;
}) {
  useEffect(() => {
    const client = getGatewayClient();

    const unsub = client.onMessage((msg: GatewayResponse) => {
      switch (msg.type) {
        case "proactive.message": {
          const { text, action } = msg.payload;
          toast(text, {
            duration: 10000,
            action: action === "schedule"
              ? {
                  label: "去安排",
                  onClick: () => opts?.onOpenTodayTodo?.(),
                }
              : undefined,
          });
          break;
        }

        case "proactive.todo_nudge": {
          const { text, suggestion } = msg.payload;
          toast(suggestion, {
            duration: 15000,
            description: text,
            action: {
              label: "查看待办",
              onClick: () => opts?.onOpenTodos?.(),
            },
          });
          break;
        }
      }
    });

    return () => unsub();
  }, [opts?.onOpenTodos, opts?.onOpenTodayTodo]);
}

/**
 * Component wrapper for the proactive nudge hook.
 * Place this in the root component tree.
 */
export function NudgeToastListener({
  onOpenTodos,
  onOpenTodayTodo,
}: {
  onOpenTodos?: () => void;
  onOpenTodayTodo?: () => void;
}) {
  useProactiveNudge({ onOpenTodos, onOpenTodayTodo });
  return null;
}
