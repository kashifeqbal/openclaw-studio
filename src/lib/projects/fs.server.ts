import fs from "node:fs";
import path from "node:path";

import { resolveStateDir } from "@/lib/clawdbot/paths";
import { resolveAgentWorkspaceDir } from "./agentWorkspace";

export const resolveAgentStateDir = (agentId: string) => {
  return path.join(resolveStateDir(), "agents", agentId);
};

export const deleteDirIfExists = (targetPath: string, label: string, warnings: string[]) => {
  if (!fs.existsSync(targetPath)) {
    warnings.push(`${label} not found at ${targetPath}.`);
    return;
  }
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${label} path is not a directory: ${targetPath}`);
  }
  fs.rmSync(targetPath, { recursive: true, force: false });
};

export const deleteAgentArtifacts = (projectId: string, agentId: string, warnings: string[]) => {
  const workspaceDir = resolveAgentWorkspaceDir(projectId, agentId);
  deleteDirIfExists(workspaceDir, "Agent workspace", warnings);

  const agentDir = resolveAgentStateDir(agentId);
  deleteDirIfExists(agentDir, "Agent state", warnings);
};
