import { NextResponse } from "next/server";

import { type StudioSettingsPatch } from "@/lib/studio/settings";
import { isStudioDomainApiModeEnabled } from "@/lib/controlplane/runtime";
import {
  applyStudioSettingsPatch,
  loadLocalGatewayDefaults,
  loadStudioSettings,
  redactLocalGatewayDefaultsSecrets,
  redactStudioSettingsSecrets,
} from "@/lib/studio/settings-store";

export const runtime = "nodejs";

const isPatch = (value: unknown): value is StudioSettingsPatch =>
  Boolean(value && typeof value === "object");

const buildSettingsResponseBody = () => {
  const settings = loadStudioSettings();
  const localGatewayDefaults = loadLocalGatewayDefaults();
  return {
    settings: redactStudioSettingsSecrets(settings),
    localGatewayDefaults: redactLocalGatewayDefaultsSecrets(localGatewayDefaults),
    domainApiModeEnabled: isStudioDomainApiModeEnabled(),
  };
};

export async function GET() {
  try {
    return NextResponse.json(buildSettingsResponseBody());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load studio settings.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    if (!isPatch(body)) {
      return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
    }
    applyStudioSettingsPatch(body);
    return NextResponse.json(buildSettingsResponseBody());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save studio settings.";
    console.error(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
