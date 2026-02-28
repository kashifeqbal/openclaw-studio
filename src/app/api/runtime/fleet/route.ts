import { NextResponse } from "next/server";

import { hydrateAgentFleetFromGateway } from "@/features/agents/operations/agentFleetHydration";
import type { GatewayModelPolicySnapshot } from "@/lib/gateway/models";
import { getControlPlaneRuntime, isStudioDomainApiModeEnabled } from "@/lib/controlplane/runtime";
import { loadStudioSettings } from "@/lib/studio/settings-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isStudioDomainApiModeEnabled()) {
    return NextResponse.json({ enabled: false, error: "domain_api_mode_disabled" }, { status: 404 });
  }

  let cachedConfigSnapshot: GatewayModelPolicySnapshot | null = null;
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const record = body as { cachedConfigSnapshot?: unknown };
      if (record.cachedConfigSnapshot && typeof record.cachedConfigSnapshot === "object") {
        cachedConfigSnapshot = record.cachedConfigSnapshot as GatewayModelPolicySnapshot;
      }
    }
  } catch {}

  const controlPlane = getControlPlaneRuntime();
  try {
    await controlPlane.ensureStarted();
  } catch (err) {
    const message = err instanceof Error ? err.message : "controlplane_start_failed";
    return NextResponse.json(
      { enabled: true, error: message, code: "GATEWAY_UNAVAILABLE", reason: "gateway_unavailable" },
      { status: 503 }
    );
  }

  try {
    const settings = loadStudioSettings();
    const gatewayUrl = settings.gateway?.url?.trim() ?? "";
    if (!gatewayUrl) {
      return NextResponse.json({ enabled: true, error: "gateway_url_not_configured" }, { status: 503 });
    }
    const result = await hydrateAgentFleetFromGateway({
      client: {
        call: (method, params) => controlPlane.callGateway(method, params),
      },
      gatewayUrl,
      cachedConfigSnapshot,
      loadStudioSettings: async () => settings,
      isDisconnectLikeError: () => false,
      logError: (message, error) => console.error(message, error),
    });
    return NextResponse.json({ enabled: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "fleet_load_failed";
    return NextResponse.json({ enabled: true, error: message }, { status: 500 });
  }
}
