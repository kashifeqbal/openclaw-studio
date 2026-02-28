import { NextResponse } from "next/server";

import {
  ensureDomainIntentRuntime,
  executeGatewayIntent,
  parseIntentBody,
} from "@/lib/controlplane/intent-route";
import {
  upsertAgentExecApprovalsPolicyViaRuntime,
  type ExecutionRoleId,
} from "@/lib/controlplane/exec-approvals";

export const runtime = "nodejs";

const VALID_ROLES = new Set<ExecutionRoleId>(["conservative", "collaborative", "autonomous"]);

export async function POST(request: Request) {
  const bodyOrError = await parseIntentBody(request);
  if (bodyOrError instanceof Response) {
    return bodyOrError as NextResponse;
  }

  const hasFilePayload = "file" in bodyOrError;
  if (hasFilePayload) {
    const baseHash = typeof bodyOrError.baseHash === "string" ? bodyOrError.baseHash.trim() : "";
    return await executeGatewayIntent("exec.approvals.set", {
      file: bodyOrError.file,
      ...(baseHash ? { baseHash } : {}),
    });
  }

  const agentId = typeof bodyOrError.agentId === "string" ? bodyOrError.agentId.trim() : "";
  const role = typeof bodyOrError.role === "string" ? bodyOrError.role.trim() : "";
  if (!agentId || !VALID_ROLES.has(role as ExecutionRoleId)) {
    return NextResponse.json({ error: "agentId and valid role are required." }, { status: 400 });
  }

  const runtimeOrError = await ensureDomainIntentRuntime();
  if (runtimeOrError instanceof Response) {
    return runtimeOrError as NextResponse;
  }
  try {
    await upsertAgentExecApprovalsPolicyViaRuntime({
      runtime: runtimeOrError,
      agentId,
      role: role as ExecutionRoleId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "exec_approvals_set_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
