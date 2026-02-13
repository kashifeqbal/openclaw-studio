import { describe, expect, it, vi } from "vitest";

import {
  buildQueuedMutationBlock,
  resolveMutationPostRunIntent,
  resolveMutationStartGuard,
  resolvePendingSetupAutoRetryIntent,
} from "@/features/agents/operations/agentMutationLifecycleController";
import {
  resolveGuidedCreateCompletion,
  runGuidedCreateWorkflow,
} from "@/features/agents/operations/guidedCreateWorkflow";
import { runConfigMutationWorkflow } from "@/features/agents/operations/configMutationWorkflow";
import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";

const createSetup = (): AgentGuidedSetup => ({
  agentOverrides: {
    sandbox: { mode: "non-main", workspaceAccess: "ro" },
    tools: { profile: "coding", alsoAllow: ["group:runtime"], deny: ["group:web"] },
  },
  files: {
    "AGENTS.md": "# Mission",
  },
  execApprovals: {
    security: "allowlist",
    ask: "always",
    allowlist: [{ pattern: "/usr/bin/git" }],
  },
});

describe("agentMutationLifecycleController integration", () => {
  it("page create handler maps controller decisions to guided create flow side effects", async () => {
    const setup = createSetup();
    const guardDenied = resolveMutationStartGuard({
      status: "disconnected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });

    expect(guardDenied).toEqual({
      kind: "deny",
      reason: "not-connected",
    });

    const guardAllowed = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(guardAllowed).toEqual({ kind: "allow" });

    const queued = buildQueuedMutationBlock({
      kind: "create-agent",
      agentId: "",
      agentName: "Agent One",
      startedAt: 42,
    });
    expect(queued.phase).toBe("queued");

    const pendingByAgentId: Record<string, AgentGuidedSetup> = {};
    const result = await runGuidedCreateWorkflow(
      {
        name: "Agent One",
        setup,
        isLocalGateway: true,
      },
      {
        createAgent: async () => ({ id: "agent-1" }),
        applySetup: async () => {
          throw new Error("setup failed");
        },
        upsertPending: (agentId, nextSetup) => {
          pendingByAgentId[agentId] = nextSetup;
        },
        removePending: (agentId) => {
          delete pendingByAgentId[agentId];
        },
      }
    );

    const completion = resolveGuidedCreateCompletion({
      agentName: "Agent One",
      result,
    });

    expect(result.setupStatus).toBe("pending");
    expect(pendingByAgentId["agent-1"]).toEqual(setup);
    expect(completion.shouldReloadAgents).toBe(true);
    expect(completion.pendingErrorMessage).toContain("guided setup is pending");
  });

  it("page rename and delete handlers share lifecycle guard plus post-run transitions", async () => {
    const blocked = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: true,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(blocked).toEqual({
      kind: "deny",
      reason: "create-block-active",
    });

    const allowed = resolveMutationStartGuard({
      status: "connected",
      hasCreateBlock: false,
      hasRenameBlock: false,
      hasDeleteBlock: false,
    });
    expect(allowed).toEqual({ kind: "allow" });

    const executeMutation = vi.fn(async () => undefined);

    const renameCompleted = await runConfigMutationWorkflow(
      {
        kind: "rename-agent",
        isLocalGateway: false,
      },
      {
        executeMutation,
        shouldAwaitRemoteRestart: async () => false,
      }
    );
    expect(resolveMutationPostRunIntent({ disposition: renameCompleted.disposition })).toEqual({
      kind: "clear",
    });

    const deleteAwaitingRestart = await runConfigMutationWorkflow(
      {
        kind: "delete-agent",
        isLocalGateway: false,
      },
      {
        executeMutation,
        shouldAwaitRemoteRestart: async () => true,
      }
    );
    expect(resolveMutationPostRunIntent({ disposition: deleteAwaitingRestart.disposition })).toEqual(
      {
        kind: "awaiting-restart",
        patch: {
          phase: "awaiting-restart",
          sawDisconnect: false,
        },
      }
    );
    expect(executeMutation).toHaveBeenCalledTimes(2);
  });

  it("page pending setup auto-retry effect only runs for controller retry intents", () => {
    const applyPendingCreateSetupForAgentId = vi.fn();

    const retryIntent = resolvePendingSetupAutoRetryIntent({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: {
        "agent-2": {},
      },
      knownAgentIds: new Set(["agent-2"]),
      attemptedAgentIds: new Set<string>(),
      inFlightAgentIds: new Set<string>(),
    });

    if (retryIntent.kind === "retry") {
      applyPendingCreateSetupForAgentId({
        agentId: retryIntent.agentId,
        source: "auto",
      });
    }
    expect(applyPendingCreateSetupForAgentId).toHaveBeenCalledTimes(1);

    const skipIntent = resolvePendingSetupAutoRetryIntent({
      status: "connected",
      agentsLoadedOnce: true,
      loadedScopeMatches: true,
      hasActiveCreateBlock: false,
      retryBusyAgentId: null,
      pendingSetupsByAgentId: {
        "agent-2": {},
      },
      knownAgentIds: new Set(["agent-2"]),
      attemptedAgentIds: new Set(["agent-2"]),
      inFlightAgentIds: new Set<string>(),
    });

    if (skipIntent.kind === "retry") {
      applyPendingCreateSetupForAgentId({
        agentId: skipIntent.agentId,
        source: "auto",
      });
    }
    expect(skipIntent).toEqual({
      kind: "skip",
      reason: "no-eligible-agent",
    });
    expect(applyPendingCreateSetupForAgentId).toHaveBeenCalledTimes(1);
  });
});
