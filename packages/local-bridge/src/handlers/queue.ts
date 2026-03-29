/**
 * Queue Handler — handles QUEUE_STATUS typed messages.
 *
 * Protocol:
 *   Input:  { type: "QUEUE_STATUS", id }
 *   Output: { type: "QUEUE_STATUS", id, status, health, tenantStatus? }
 *
 * Also handles QUEUE_CANCEL to cancel a queued request.
 */

import type { WebSocket } from "ws";
import type { TypedMessage } from "../ws/types.js";
import type { HandlerContext } from "./types.js";
import type { RequestQueue } from "../queue/index.js";

export async function handleQueueStatus(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const queue = (ctx as any).requestQueue as RequestQueue | undefined;

  if (!queue) {
    ws.send(JSON.stringify({
      type: "QUEUE_STATUS",
      id: msg.id,
      error: "Queue not available",
    }));
    return;
  }

  const status = queue.getStatus();
  const health = queue.getHealth();
  const tenantId = msg["tenantId"] as string | undefined;
  const tenantStatus = tenantId ? queue.getTenantStatus(tenantId) : undefined;

  ws.send(JSON.stringify({
    type: "QUEUE_STATUS",
    id: msg.id,
    status,
    health,
    ...(tenantStatus ? { tenantStatus } : {}),
  }));
}

export async function handleQueueCancel(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const queue = (ctx as any).requestQueue as RequestQueue | undefined;

  if (!queue) {
    ws.send(JSON.stringify({
      type: "QUEUE_CANCEL",
      id: msg.id,
      error: "Queue not available",
    }));
    return;
  }

  const itemId = msg["itemId"] as string | undefined;
  if (!itemId) {
    ws.send(JSON.stringify({
      type: "QUEUE_CANCEL",
      id: msg.id,
      error: "Missing itemId",
    }));
    return;
  }

  const cancelled = await queue.cancel(itemId);

  ws.send(JSON.stringify({
    type: "QUEUE_CANCEL",
    id: msg.id,
    cancelled,
  }));
}
