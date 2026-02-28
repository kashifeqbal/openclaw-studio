// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

type RuntimeMock = {
  ensureStarted: () => Promise<void>;
  snapshot: () => { status: string; reason: string | null; asOf: string | null; outboxHead: number };
  eventsAfter: (lastSeenId: number, limit?: number) => Array<{
    id: number;
    event: unknown;
    createdAt: string;
  }>;
  subscribe: (handler: (entry: { id: number; event: unknown; createdAt: string }) => void) => () => void;
};

const loadRouteModule = async <T>(modulePath: string, runtimeMock: RuntimeMock) => {
  vi.resetModules();
  vi.doMock("@/lib/controlplane/runtime", () => ({
    isStudioDomainApiModeEnabled: () => true,
    getControlPlaneRuntime: () => runtimeMock,
  }));
  return await import(modulePath) as T;
};

describe("runtime routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("summary route returns projection-backed snapshot and freshness", async () => {
    const runtimeMock: RuntimeMock = {
      ensureStarted: async () => {},
      snapshot: () => ({
        status: "connected",
        reason: null,
        asOf: "2026-02-28T02:40:00.000Z",
        outboxHead: 12,
      }),
      eventsAfter: () => [],
      subscribe: () => () => {},
    };

    const mod = await loadRouteModule<{ GET: () => Promise<Response> }>(
      "@/app/api/runtime/summary/route",
      runtimeMock
    );
    const response = await mod.GET();
    expect(response.status).toBe(200);
    const body = await response.json() as {
      enabled: boolean;
      summary: { status: string; outboxHead: number };
      freshness: { stale: boolean; source: string };
    };
    expect(body.enabled).toBe(true);
    expect(body.summary.status).toBe("connected");
    expect(body.summary.outboxHead).toBe(12);
    expect(body.freshness.stale).toBe(false);
    expect(body.freshness.source).toBe("gateway");
  });

  it("summary route returns degraded projection freshness when gateway start fails", async () => {
    vi.resetModules();
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {
          throw new Error("gateway offline");
        },
        snapshot: () => ({
          status: "error",
          reason: "gateway_closed",
          asOf: "2026-02-28T02:40:00.000Z",
          outboxHead: 9,
        }),
        eventsAfter: () => [],
        subscribe: () => () => {},
      }),
    }));
    vi.doMock("@/lib/controlplane/degraded-read", async () => {
      const actual = await vi.importActual<typeof import("@/lib/controlplane/degraded-read")>(
        "@/lib/controlplane/degraded-read"
      );
      return {
        ...actual,
        probeOpenClawLocalState: vi.fn(async () => ({
          at: "2026-02-28T02:41:00.000Z",
          status: { ok: false, error: "openclaw_cli_not_found" },
          sessions: { ok: false, error: "openclaw_cli_not_found" },
        })),
      };
    });

    const mod = await import("@/app/api/runtime/summary/route");
    const response = await mod.GET();
    expect(response.status).toBe(200);
    const body = await response.json() as {
      error?: string;
      freshness: { stale: boolean; source: string; reason: string | null };
    };
    expect(body.error).toBe("gateway offline");
    expect(body.freshness.stale).toBe(true);
    expect(body.freshness.source).toBe("projection");
    expect(body.freshness.reason).toBe("gateway_unavailable");
  });

  it("agent history route filters by agent id", async () => {
    const runtimeMock: RuntimeMock = {
      ensureStarted: async () => {},
      snapshot: () => ({
        status: "connected",
        reason: null,
        asOf: "2026-02-28T02:40:00.000Z",
        outboxHead: 3,
      }),
      eventsAfter: () => [
        {
          id: 1,
          event: {
            type: "gateway.event",
            event: "runtime.delta",
            seq: 10,
            payload: { sessionKey: "agent:alpha:main", delta: "a" },
            asOf: "2026-02-28T02:40:01.000Z",
          },
          createdAt: "2026-02-28T02:40:01.000Z",
        },
        {
          id: 2,
          event: {
            type: "gateway.event",
            event: "runtime.delta",
            seq: 11,
            payload: { sessionKey: "agent:beta:main", delta: "b" },
            asOf: "2026-02-28T02:40:02.000Z",
          },
          createdAt: "2026-02-28T02:40:02.000Z",
        },
      ],
      subscribe: () => () => {},
    };

    const mod = await loadRouteModule<{
      GET: (
        request: Request,
        context: { params: Promise<{ agentId: string }> }
      ) => Promise<Response>;
    }>("@/app/api/runtime/agents/[agentId]/history/route", runtimeMock);

    const response = await mod.GET(
      new Request("http://localhost/api/runtime/agents/alpha/history?limit=50"),
      { params: Promise.resolve({ agentId: "alpha" }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { entries: Array<{ id: number }> };
    expect(body.entries.map((entry) => entry.id)).toEqual([1]);
  });

  it("stream route replays from Last-Event-ID and emits live updates", async () => {
    let subscriber: ((entry: { id: number; event: unknown; createdAt: string }) => void) | null = null;
    const runtimeMock: RuntimeMock = {
      ensureStarted: async () => {},
      snapshot: () => ({
        status: "connected",
        reason: null,
        asOf: "2026-02-28T02:40:00.000Z",
        outboxHead: 4,
      }),
      eventsAfter: (lastSeenId: number) => {
        expect(lastSeenId).toBe(2);
        return [
          {
            id: 3,
            event: {
              type: "gateway.event",
              event: "runtime.delta",
              seq: 20,
              payload: { sessionKey: "agent:alpha:main", delta: "replay" },
              asOf: "2026-02-28T02:40:03.000Z",
            },
            createdAt: "2026-02-28T02:40:03.000Z",
          },
        ];
      },
      subscribe: (handler) => {
        subscriber = handler;
        return () => {
          subscriber = null;
        };
      },
    };

    const mod = await loadRouteModule<{ GET: (request: Request) => Promise<Response> }>(
      "@/app/api/runtime/stream/route",
      runtimeMock
    );
    const response = await mod.GET(
      new Request("http://localhost/api/runtime/stream", {
        headers: { "Last-Event-ID": "2" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).toBeTruthy();

    const reader = response.body!.getReader();
    const first = await reader.read();
    const firstChunk = new TextDecoder().decode(first.value);
    expect(firstChunk).toContain("id: 3");
    expect(firstChunk).toContain("event: gateway.event");

    const emit = subscriber as ((entry: { id: number; event: unknown; createdAt: string }) => void) | null;
    emit?.({
      id: 4,
      event: {
        type: "runtime.status",
        status: "reconnecting",
        reason: "gateway_closed",
        asOf: "2026-02-28T02:40:04.000Z",
      },
      createdAt: "2026-02-28T02:40:04.000Z",
    });

    const second = await reader.read();
    const secondChunk = new TextDecoder().decode(second.value);
    expect(secondChunk).toContain("id: 4");
    expect(secondChunk).toContain("event: runtime.status");

    await reader.cancel();
  });

  it("agent-rename and agent-delete intent routes forward to runtime", async () => {
    const callGateway = vi.fn(async () => ({ ok: true }));
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {},
        callGateway,
      }),
    }));

    const renameRoute = await import("@/app/api/intents/agent-rename/route");
    const deleteRoute = await import("@/app/api/intents/agent-delete/route");

    const renameRes = await renameRoute.POST(
      new Request("http://localhost/api/intents/agent-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "agent-1", name: "Agent One Renamed" }),
      })
    );
    expect(renameRes.status).toBe(200);

    const deleteRes = await deleteRoute.POST(
      new Request("http://localhost/api/intents/agent-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "agent-1" }),
      })
    );
    expect(deleteRes.status).toBe(200);

    expect(callGateway).toHaveBeenCalledWith("agents.update", {
      agentId: "agent-1",
      name: "Agent One Renamed",
    });
    expect(callGateway).toHaveBeenCalledWith("agents.delete", {
      agentId: "agent-1",
    });
  });

  it("runtime fleet route hydrates through control-plane runtime", async () => {
    const callGateway = vi.fn(async () => ({ ok: true }));
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {},
        callGateway,
      }),
    }));
    vi.doMock("@/lib/studio/settings-store", () => ({
      loadStudioSettings: () => ({
        version: 1,
        gateway: { url: "ws://localhost:3000/ws", token: "" },
        localGatewayDefaults: { url: "", token: "" },
        focused: {},
        avatars: {},
      }),
    }));
    vi.doMock("@/features/agents/operations/agentFleetHydration", () => ({
      hydrateAgentFleetFromGateway: vi.fn(async () => ({
        seeds: [{ agentId: "agent-1", name: "Agent One", sessionKey: "agent:agent-1:main" }],
        sessionCreatedAgentIds: ["agent-1"],
        sessionSettingsSyncedAgentIds: ["agent-1"],
        summaryPatches: [],
        suggestedSelectedAgentId: "agent-1",
        configSnapshot: null,
      })),
    }));
    const route = await import("@/app/api/runtime/fleet/route");
    const response = await route.POST(
      new Request("http://localhost/api/runtime/fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cachedConfigSnapshot: null }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { seeds: Array<{ agentId: string }> } };
    expect(body.result.seeds[0]?.agentId).toBe("agent-1");
  });
});
