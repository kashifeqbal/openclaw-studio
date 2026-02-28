import type { ControlPlaneDomainEvent, ControlPlaneOutboxEntry } from "@/lib/controlplane/contracts";

const AGENT_SESSION_KEY_RE = /^agent:([^:]+):/;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object");

const parseAgentIdFromSessionKey = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const match = value.match(AGENT_SESSION_KEY_RE);
  return match ? match[1] : null;
};

const resolveAgentIdForDomainEvent = (event: ControlPlaneDomainEvent): string | null => {
  if (event.type !== "gateway.event") return null;
  const payload = event.payload;
  if (!isObject(payload)) return null;
  const directAgentId = typeof payload.agentId === "string" ? payload.agentId.trim() : "";
  if (directAgentId) return directAgentId;
  const fromSession =
    parseAgentIdFromSessionKey(payload.sessionKey) ??
    parseAgentIdFromSessionKey(payload.key) ??
    parseAgentIdFromSessionKey(payload.runSessionKey);
  return fromSession;
};

export const selectAgentHistoryEntries = (
  entries: ControlPlaneOutboxEntry[],
  agentId: string,
  limit: number
): ControlPlaneOutboxEntry[] => {
  const normalizedAgent = agentId.trim();
  if (!normalizedAgent) return [];
  const filtered = entries.filter((entry) => resolveAgentIdForDomainEvent(entry.event) === normalizedAgent);
  if (limit <= 0) return [];
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
};
