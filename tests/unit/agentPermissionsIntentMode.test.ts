import { describe, expect, it, vi } from "vitest";

import { updateExecutionRoleViaStudio } from "@/features/agents/operations/agentPermissionsOperation";

describe("agentPermissionsOperation intent mode", () => {
  it("uses exec-approvals-set intent when domain mode is enabled", async () => {
    const call = vi.fn(async (method: string) => {
      if (method === "exec.approvals.get" || method === "exec.approvals.set") {
        throw new Error(`${method} should not be called in domain mode`);
      }
      if (method === "config.get") {
        return {
          hash: "cfg-hash-1",
          config: { agents: [{ id: "agent-1", sandbox: { mode: "normal" } }] },
        };
      }
      if (method === "config.set") {
        return { ok: true };
      }
      if (method === "sessions.patch") {
        return { ok: true, key: "agent:agent-1:main" };
      }
      return { ok: true };
    });
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await updateExecutionRoleViaStudio({
      client: { call } as never,
      agentId: "agent-1",
      sessionKey: "agent:agent-1:main",
      role: "collaborative",
      loadAgents: async () => {},
      useDomainIntents: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/intents/exec-approvals-set",
      expect.objectContaining({ method: "POST" })
    );
    expect(call).not.toHaveBeenCalledWith("exec.approvals.get", expect.anything());
    expect(call).not.toHaveBeenCalledWith("exec.approvals.set", expect.anything());
    vi.unstubAllGlobals();
  });
});
