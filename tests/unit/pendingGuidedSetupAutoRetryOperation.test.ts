import { describe, expect, it, vi } from "vitest";

import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import { runPendingGuidedSetupAutoRetryViaStudio } from "@/features/agents/operations/pendingGuidedSetupAutoRetryOperation";

describe("pendingGuidedSetupAutoRetryOperation", () => {
  it("skips when intent is not retry", async () => {
    const attempted = new Set<string>();
    const inFlight = new Set<string>();
    const applyRetry = vi.fn(async () => true);

    const result = await runPendingGuidedSetupAutoRetryViaStudio({
      status: "disconnected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: { a1: {} as unknown as AgentGuidedSetup },
      knownAgentIds: new Set(["a1"]),
      attemptedAgentIds: attempted,
      inFlightAgentIds: inFlight,
      applyRetry,
    });

    expect(result).toBe(false);
    expect(applyRetry).not.toHaveBeenCalled();
    expect(attempted.size).toBe(0);
  });

  it("marks attempted and triggers retry", async () => {
    const attempted = new Set<string>();
    const inFlight = new Set<string>();
    const applyRetry = vi.fn(async () => true);

    const result = await runPendingGuidedSetupAutoRetryViaStudio({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: { a1: {} as unknown as AgentGuidedSetup },
      knownAgentIds: new Set(["a1"]),
      attemptedAgentIds: attempted,
      inFlightAgentIds: inFlight,
      applyRetry,
    });

    expect(result).toBe(true);
    expect(applyRetry).toHaveBeenCalledWith("a1");
    expect(attempted.has("a1")).toBe(true);
  });
});

