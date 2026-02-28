// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

describe("intent routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("chat-send route forwards to gateway intent runtime", async () => {
    const callGateway = vi.fn(async () => ({ runId: "run-1", status: "started" }));
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {},
        callGateway,
      }),
    }));
    const mod = await import("@/app/api/intents/chat-send/route");

    const response = await mod.POST(
      new Request("http://localhost/api/intents/chat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: "agent:agent-1:main",
          message: "hello",
          idempotencyKey: "run-1",
          deliver: false,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(callGateway).toHaveBeenCalledWith("chat.send", {
      sessionKey: "agent:agent-1:main",
      message: "hello",
      idempotencyKey: "run-1",
      deliver: false,
    });
  });

  it("sessions-reset and agent-wait routes forward expected payloads", async () => {
    const callGateway = vi.fn(async () => ({ ok: true }));
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {},
        callGateway,
      }),
    }));
    const resetRoute = await import("@/app/api/intents/sessions-reset/route");
    const waitRoute = await import("@/app/api/intents/agent-wait/route");

    const resetResponse = await resetRoute.POST(
      new Request("http://localhost/api/intents/sessions-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "agent:agent-1:main" }),
      })
    );
    const waitResponse = await waitRoute.POST(
      new Request("http://localhost/api/intents/agent-wait", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: "run-1", timeoutMs: 3000 }),
      })
    );

    expect(resetResponse.status).toBe(200);
    expect(waitResponse.status).toBe(200);
    expect(callGateway).toHaveBeenCalledWith("sessions.reset", { key: "agent:agent-1:main" });
    expect(callGateway).toHaveBeenCalledWith("agent.wait", { runId: "run-1", timeoutMs: 3000 });
  });

  it("exec-approvals-set role mode delegates to policy upsert helper", async () => {
    const upsert = vi.fn(async () => undefined);
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {},
        callGateway: vi.fn(async () => ({ ok: true })),
      }),
    }));
    vi.doMock("@/lib/controlplane/exec-approvals", async () => {
      const actual = await vi.importActual<typeof import("@/lib/controlplane/exec-approvals")>(
        "@/lib/controlplane/exec-approvals"
      );
      return {
        ...actual,
        upsertAgentExecApprovalsPolicyViaRuntime: upsert,
      };
    });
    const mod = await import("@/app/api/intents/exec-approvals-set/route");

    const response = await mod.POST(
      new Request("http://localhost/api/intents/exec-approvals-set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: "agent-1", role: "collaborative" }),
      })
    );
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: "agent-1",
        role: "collaborative",
      })
    );
  });

  it("chat-send returns deterministic gateway_unavailable response when runtime cannot start", async () => {
    vi.doMock("@/lib/controlplane/runtime", () => ({
      isStudioDomainApiModeEnabled: () => true,
      getControlPlaneRuntime: () => ({
        ensureStarted: async () => {
          throw new Error("gateway unavailable");
        },
        callGateway: vi.fn(),
      }),
    }));
    const mod = await import("@/app/api/intents/chat-send/route");

    const response = await mod.POST(
      new Request("http://localhost/api/intents/chat-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionKey: "agent:agent-1:main",
          message: "hello",
          idempotencyKey: "run-1",
          deliver: false,
        }),
      })
    );

    expect(response.status).toBe(503);
    const body = await response.json() as { code?: string; reason?: string };
    expect(body.code).toBe("GATEWAY_UNAVAILABLE");
    expect(body.reason).toBe("gateway_unavailable");
  });
});
