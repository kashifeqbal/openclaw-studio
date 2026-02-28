import { NextResponse } from "next/server";

import { deriveRuntimeFreshness, probeOpenClawLocalState } from "@/lib/controlplane/degraded-read";
import { selectAgentHistoryEntries } from "@/lib/controlplane/read-model";
import { getControlPlaneRuntime, isStudioDomainApiModeEnabled } from "@/lib/controlplane/runtime";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

const resolveLimit = (raw: string | null): number => {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  if (parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

export async function GET(
  request: Request,
  context: { params: Promise<{ agentId: string }> }
) {
  if (!isStudioDomainApiModeEnabled()) {
    return NextResponse.json({ enabled: false, error: "domain_api_mode_disabled" }, { status: 404 });
  }

  const { agentId } = await context.params;
  const normalizedAgentId = agentId.trim();
  if (!normalizedAgentId) {
    return NextResponse.json({ error: "agentId is required." }, { status: 400 });
  }

  const controlPlane = getControlPlaneRuntime();
  let startError: string | null = null;
  try {
    await controlPlane.ensureStarted();
  } catch (err) {
    startError = err instanceof Error ? err.message : "controlplane_start_failed";
  }

  const url = new URL(request.url);
  const limit = resolveLimit(url.searchParams.get("limit"));
  const snapshot = controlPlane.snapshot();
  const probe = snapshot.status === "connected" ? null : await probeOpenClawLocalState();
  const allEntries = controlPlane.eventsAfter(0, MAX_LIMIT * 5);
  const entries = selectAgentHistoryEntries(allEntries, normalizedAgentId, limit);

  return NextResponse.json({
    enabled: true,
    agentId: normalizedAgentId,
    ...(startError ? { error: startError } : {}),
    entries,
    freshness: deriveRuntimeFreshness(snapshot, probe),
    ...(probe ? { probe } : {}),
  });
}
