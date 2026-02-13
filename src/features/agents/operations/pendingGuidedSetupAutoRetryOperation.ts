import type { AgentGuidedSetup } from "@/features/agents/operations/createAgentOperation";
import { resolvePendingSetupAutoRetryIntent } from "@/features/agents/operations/agentMutationLifecycleController";

export const runPendingGuidedSetupAutoRetryViaStudio = async (params: {
  status: "connected" | "connecting" | "disconnected";
  agentsLoadedOnce: boolean;
  loadedScopeMatches: boolean;
  hasActiveCreateBlock: boolean;
  retryBusyAgentId: string | null;
  pendingSetupsByAgentId: Record<string, AgentGuidedSetup>;
  knownAgentIds: Set<string>;
  attemptedAgentIds: Set<string>;
  inFlightAgentIds: Set<string>;
  applyRetry: (agentId: string) => Promise<boolean>;
}): Promise<boolean> => {
  const intent = resolvePendingSetupAutoRetryIntent({
    status: params.status,
    agentsLoadedOnce: params.agentsLoadedOnce,
    loadedScopeMatches: params.loadedScopeMatches,
    hasActiveCreateBlock: params.hasActiveCreateBlock,
    retryBusyAgentId: params.retryBusyAgentId,
    pendingSetupsByAgentId: params.pendingSetupsByAgentId,
    knownAgentIds: params.knownAgentIds,
    attemptedAgentIds: params.attemptedAgentIds,
    inFlightAgentIds: params.inFlightAgentIds,
  });
  if (intent.kind !== "retry") {
    return false;
  }
  params.attemptedAgentIds.add(intent.agentId);
  return await params.applyRetry(intent.agentId);
};

