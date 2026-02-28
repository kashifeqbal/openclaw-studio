import { NextResponse } from "next/server";

import { deriveRuntimeFreshness, probeOpenClawLocalState } from "@/lib/controlplane/degraded-read";
import { getControlPlaneRuntime, isStudioDomainApiModeEnabled } from "@/lib/controlplane/runtime";

export const runtime = "nodejs";

export async function GET() {
  if (!isStudioDomainApiModeEnabled()) {
    return NextResponse.json({ enabled: false, error: "domain_api_mode_disabled" }, { status: 404 });
  }

  const controlPlane = getControlPlaneRuntime();
  let startError: string | null = null;
  try {
    await controlPlane.ensureStarted();
  } catch (err) {
    startError = err instanceof Error ? err.message : "controlplane_start_failed";
  }

  const snapshot = controlPlane.snapshot();
  const probe = snapshot.status === "connected" ? null : await probeOpenClawLocalState();
  return NextResponse.json({
    enabled: true,
    ...(startError ? { error: startError } : {}),
    summary: snapshot,
    freshness: deriveRuntimeFreshness(snapshot, probe),
    ...(probe ? { probe } : {}),
  });
}
