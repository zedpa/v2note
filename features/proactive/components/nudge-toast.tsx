"use client";

import { useEffect } from "react";
import { fabNotify } from "@/shared/lib/fab-notify";
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
          const { text } = msg.payload;
          fabNotify.info(text);
          break;
        }

        case "proactive.todo_nudge": {
          const { suggestion } = msg.payload;
          fabNotify.info(suggestion);
          break;
        }

        case "proactive.morning_briefing": {
          fabNotify.info(msg.payload.text);
          break;
        }

        case "proactive.relay_reminder": {
          fabNotify.info(msg.payload.text);
          break;
        }

        case "proactive.evening_summary": {
          fabNotify.info(msg.payload.text);
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
