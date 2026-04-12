import { getGatewayClient } from "@/features/chat/lib/gateway-client";

/**
 * Process a recording via the Gateway WebSocket.
 * Replaces the previous Supabase Edge Function call.
 */
export async function processRecording(
  recordId: string,
  text: string,
): Promise<void> {
  const client = getGatewayClient();

  if (!client.connected) {
    client.connect();
    // Wait briefly for connection
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  client.send({
    type: "process",
    payload: { text, recordId },
  });
}
