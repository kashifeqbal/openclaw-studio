import { NextResponse } from "next/server";

import {
  BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE,
  coerceBrSingleRecord,
  createTaskControlPlaneBrRunner,
  isBeadsWorkspaceError,
} from "@/lib/task-control-plane/br-runner";

export const runtime = "nodejs";

const extractId = (request: Request): string => {
  let id: string | null = null;
  try {
    id = new URL(request.url).searchParams.get("id");
  } catch {
    id = null;
  }
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    throw new Error('Missing required query parameter: "id".');
  }
  return trimmed;
};

export async function GET(request: Request) {
  try {
    const id = extractId(request);
    const runner = createTaskControlPlaneBrRunner();
    const raw = runner.runBrJson(["show", id]);
    const bead = coerceBrSingleRecord(raw, { command: "show", id });
    return NextResponse.json({ bead });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load task details.";
    if (message.includes('Missing required query parameter: "id"')) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (isBeadsWorkspaceError(message)) {
      return NextResponse.json(
        {
          error: BEADS_WORKSPACE_NOT_INITIALIZED_ERROR_MESSAGE,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
