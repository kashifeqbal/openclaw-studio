import type { ControlPlaneOutboxEntry } from "@/lib/controlplane/contracts";
import { getControlPlaneRuntime, isStudioDomainApiModeEnabled } from "@/lib/controlplane/runtime";

export const runtime = "nodejs";

const REPLAY_LIMIT = 2000;
const HEARTBEAT_INTERVAL_MS = 15_000;

const encoder = new TextEncoder();

const parseLastEventId = (request: Request): number => {
  const headerValue = request.headers.get("last-event-id");
  if (!headerValue) return 0;
  const parsed = Number(headerValue.trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
};

const toSseFrame = (entry: ControlPlaneOutboxEntry): Uint8Array => {
  const eventName = entry.event.type === "runtime.status" ? "runtime.status" : "gateway.event";
  return encoder.encode(
    `id: ${entry.id}\nevent: ${eventName}\ndata: ${JSON.stringify(entry.event)}\n\n`
  );
};

const heartbeatFrame = (): Uint8Array => encoder.encode(": heartbeat\n\n");

export async function GET(request: Request) {
  if (!isStudioDomainApiModeEnabled()) {
    return new Response(
      JSON.stringify({ enabled: false, error: "domain_api_mode_disabled" }),
      { status: 404, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const controlPlane = getControlPlaneRuntime();
  try {
    await controlPlane.ensureStarted();
  } catch (err) {
    return new Response(
      JSON.stringify({
        enabled: true,
        error: err instanceof Error ? err.message : "controlplane_start_failed",
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }

  const lastSeenId = parseLastEventId(request);
  const replayEntries = controlPlane.eventsAfter(lastSeenId, REPLAY_LIMIT);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => {};
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          controller.close();
        } catch {}
      };

      for (const entry of replayEntries) {
        controller.enqueue(toSseFrame(entry));
      }

      unsubscribe = controlPlane.subscribe((entry) => {
        if (closed) return;
        controller.enqueue(toSseFrame(entry));
      });

      heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(heartbeatFrame());
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
