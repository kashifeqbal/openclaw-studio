import type { ControlPlaneRuntime } from "@/lib/controlplane/runtime";
import { ControlPlaneGatewayError } from "@/lib/controlplane/openclaw-adapter";

export type GatewayExecApprovalSecurity = "deny" | "allowlist" | "full";
export type GatewayExecApprovalAsk = "off" | "on-miss" | "always";
export type ExecutionRoleId = "conservative" | "collaborative" | "autonomous";

type ExecAllowlistEntry = {
  pattern: string;
};

type ExecApprovalsAgent = {
  security?: GatewayExecApprovalSecurity;
  ask?: GatewayExecApprovalAsk;
  askFallback?: string;
  autoAllowSkills?: boolean;
  allowlist?: ExecAllowlistEntry[];
};

type ExecApprovalsFile = {
  version: 1;
  socket?: {
    path?: string;
    token?: string;
  };
  defaults?: {
    security?: string;
    ask?: string;
    askFallback?: string;
    autoAllowSkills?: boolean;
  };
  agents?: Record<string, ExecApprovalsAgent>;
};

type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  hash: string;
  file?: ExecApprovalsFile;
};

const normalizeAllowlist = (patterns: Array<{ pattern: string }>): Array<{ pattern: string }> => {
  const next = patterns
    .map((entry) => entry.pattern.trim())
    .filter((pattern) => pattern.length > 0);
  return Array.from(new Set(next)).map((pattern) => ({ pattern }));
};

const resolvePolicyForRole = (params: {
  role: ExecutionRoleId;
  allowlist: Array<{ pattern: string }>;
}):
  | {
      security: "full" | "allowlist";
      ask: "off" | "always";
      allowlist: Array<{ pattern: string }>;
    }
  | null => {
  if (params.role === "conservative") return null;
  if (params.role === "autonomous") {
    return { security: "full", ask: "off", allowlist: params.allowlist };
  }
  return { security: "allowlist", ask: "always", allowlist: params.allowlist };
};

const isRetryableSetError = (err: unknown): boolean => {
  if (!(err instanceof ControlPlaneGatewayError)) return false;
  const message = err.message.toLowerCase();
  return (
    err.code.trim().toUpperCase() === "INVALID_REQUEST" &&
    (message.includes("re-run exec.approvals.get") || message.includes("changed since last load"))
  );
};

export const upsertAgentExecApprovalsPolicyViaRuntime = async (params: {
  runtime: ControlPlaneRuntime;
  agentId: string;
  role: ExecutionRoleId;
}): Promise<void> => {
  const agentId = params.agentId.trim();
  if (!agentId) {
    throw new Error("Agent id is required.");
  }

  const snapshot = await params.runtime.callGateway<ExecApprovalsSnapshot>("exec.approvals.get", {});
  const baseFile: ExecApprovalsFile =
    snapshot.file && typeof snapshot.file === "object"
      ? {
          version: 1,
          socket: snapshot.file.socket,
          defaults: snapshot.file.defaults,
          agents: { ...(snapshot.file.agents ?? {}) },
        }
      : { version: 1, agents: {} };

  const existingAllowlist = Array.isArray(baseFile.agents?.[agentId]?.allowlist)
    ? baseFile.agents?.[agentId]?.allowlist?.filter(
        (entry): entry is ExecAllowlistEntry =>
          Boolean(entry && typeof entry.pattern === "string" && entry.pattern.trim().length > 0)
      ) ?? []
    : [];
  const policy = resolvePolicyForRole({
    role: params.role,
    allowlist: existingAllowlist.map((entry) => ({ pattern: entry.pattern })),
  });

  const nextAgents = { ...(baseFile.agents ?? {}) };
  if (!policy) {
    delete nextAgents[agentId];
  } else {
    const existing = nextAgents[agentId] ?? {};
    nextAgents[agentId] = {
      ...existing,
      security: policy.security,
      ask: policy.ask,
      allowlist: normalizeAllowlist(policy.allowlist),
    };
  }

  const nextFile: ExecApprovalsFile = {
    ...baseFile,
    version: 1,
    agents: nextAgents,
  };

  const setPayload = { file: nextFile, ...(snapshot.exists ? { baseHash: snapshot.hash } : {}) };
  try {
    await params.runtime.callGateway("exec.approvals.set", setPayload);
  } catch (err) {
    if (!isRetryableSetError(err)) throw err;
    const retrySnapshot = await params.runtime.callGateway<ExecApprovalsSnapshot>("exec.approvals.get", {});
    await params.runtime.callGateway("exec.approvals.set", {
      file: nextFile,
      ...(retrySnapshot.exists ? { baseHash: retrySnapshot.hash } : {}),
    });
  }
};
