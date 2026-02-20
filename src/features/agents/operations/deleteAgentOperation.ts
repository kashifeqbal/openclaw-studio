import type { GatewayClient } from "@/lib/gateway/GatewayClient";
import { fetchJson as defaultFetchJson } from "@/lib/http";
import { removeCronJobsForAgent } from "@/lib/cron/types";
import { deleteGatewayAgent } from "@/lib/gateway/agentConfig";

type FetchJson = typeof defaultFetchJson;

export type GatewayAgentStateMove = { from: string; to: string };

export type TrashAgentStateResult = {
  trashDir: string;
  moved: GatewayAgentStateMove[];
};

export type RestoreAgentStateResult = {
  restored: GatewayAgentStateMove[];
};

type DeleteAgentTransactionDeps = {
  trashAgentState: (agentId: string) => Promise<TrashAgentStateResult>;
  restoreAgentState: (agentId: string, trashDir: string) => Promise<RestoreAgentStateResult>;
  removeCronJobsForAgent: (agentId: string) => Promise<void>;
  deleteGatewayAgent: (agentId: string) => Promise<void>;
  logError?: (message: string, error: unknown) => void;
};

export type DeleteAgentTransactionResult = {
  trashed: TrashAgentStateResult;
  restored: RestoreAgentStateResult | null;
};

const runDeleteFlow = async (
  deps: DeleteAgentTransactionDeps,
  agentId: string
): Promise<DeleteAgentTransactionResult> => {
  const trimmedAgentId = agentId.trim();
  if (!trimmedAgentId) {
    throw new Error("Agent id is required.");
  }

  const trashed = await deps.trashAgentState(trimmedAgentId);

  try {
    await deps.removeCronJobsForAgent(trimmedAgentId);
    await deps.deleteGatewayAgent(trimmedAgentId);
    return { trashed, restored: null };
  } catch (err) {
    if (trashed.moved.length > 0) {
      try {
        await deps.restoreAgentState(trimmedAgentId, trashed.trashDir);
      } catch (restoreErr) {
        deps.logError?.("Failed to restore trashed agent state.", restoreErr);
      }
    }
    throw err;
  }
};

export const deleteAgentViaStudio = async (params: {
  client: GatewayClient;
  agentId: string;
  fetchJson?: FetchJson;
  logError?: (message: string, error: unknown) => void;
}): Promise<DeleteAgentTransactionResult> => {
  const fetchJson = params.fetchJson ?? defaultFetchJson;
  const logError = params.logError ?? ((message, error) => console.error(message, error));

  return runDeleteFlow(
    {
      trashAgentState: async (agentId) => {
        const { result } = await fetchJson<{ result: TrashAgentStateResult }>(
          "/api/gateway/agent-state",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ agentId }),
          }
        );
        return result;
      },
      restoreAgentState: async (agentId, trashDir) => {
        const { result } = await fetchJson<{ result: RestoreAgentStateResult }>(
          "/api/gateway/agent-state",
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ agentId, trashDir }),
          }
        );
        return result;
      },
      removeCronJobsForAgent: async (agentId) => {
        await removeCronJobsForAgent(params.client, agentId);
      },
      deleteGatewayAgent: async (agentId) => {
        await deleteGatewayAgent({ client: params.client, agentId });
      },
      logError,
    },
    params.agentId
  );
};
