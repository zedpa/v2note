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
  onOpenBriefing?: () => void;
  onOpenSummary?: () => void;
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

        case "proactive.morning_briefing": {
          toast(msg.payload.text, {
            duration: 15000,
            action: {
              label: "查看简报",
              onClick: () => opts?.onOpenBriefing?.(),
            },
          });
          break;
        }

        case "proactive.relay_reminder": {
          toast(msg.payload.text, {
            duration: 12000,
            action: {
              label: "查看简报",
              onClick: () => opts?.onOpenBriefing?.(),
            },
          });
          break;
        }

        case "proactive.evening_summary": {
          toast(msg.payload.text, {
            duration: 15000,
            action: {
              label: "查看总结",
              onClick: () => opts?.onOpenSummary?.(),
            },
          });
          break;
        }
      }
    });

    return () => unsub();
  }, [opts?.onOpenTodos, opts?.onOpenTodayTodo, opts?.onOpenBriefing, opts?.onOpenSummary]);
}

/**
 * Component wrapper for the proactive nudge hook.
 * Place this in the root component tree.
 */
export function NudgeToastListener({
  onOpenTodos,
  onOpenTodayTodo,
  onOpenBriefing,
  onOpenSummary,
}: {
  onOpenTodos?: () => void;
  onOpenTodayTodo?: () => void;
  onOpenBriefing?: () => void;
  onOpenSummary?: () => void;
}) {
  useProactiveNudge({ onOpenTodos, onOpenTodayTodo, onOpenBriefing, onOpenSummary });
  return null;
}
