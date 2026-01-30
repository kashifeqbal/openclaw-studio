import fs from "node:fs";
import path from "node:path";

import {
  WORKSPACE_FILE_NAMES,
  isWorkspaceFileName,
  type WorkspaceFileName,
} from "./workspaceFiles";

const PREVIOUS_AGENTS_LINE =
  "After every reply, end with one concise plain-English sentence summarizing what you accomplished in that reply.";
const DEFAULT_AGENTS_LINE =
  "End every reply with a final line in this exact format: Summary: <one plain-English sentence>. Do not add any text after the Summary line. Keep it on a single line, no markdown, no extra punctuation.";
const DEFAULT_AGENTS_CONTENT = `${DEFAULT_AGENTS_LINE}\n`;

const ensureDir = (dir: string) => {
  if (fs.existsSync(dir)) {
    const stat = fs.statSync(dir);
    if (!stat.isDirectory()) {
      throw new Error(`${dir} exists and is not a directory.`);
    }
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
};

const ensureFile = (filePath: string, contents: string) => {
  if (fs.existsSync(filePath)) {
    return;
  }
  fs.writeFileSync(filePath, contents, "utf8");
};

const ensureAgentsFile = (workspaceDir: string) => {
  const filePath = path.join(workspaceDir, "AGENTS.md");
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, DEFAULT_AGENTS_CONTENT, "utf8");
    return;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error("AGENTS.md exists but is not a file.");
  }
  const current = fs.readFileSync(filePath, "utf8");
  if (current.includes(DEFAULT_AGENTS_LINE)) {
    return;
  }
  let nextContent = current;
  if (nextContent.includes(PREVIOUS_AGENTS_LINE)) {
    nextContent = nextContent.replace(PREVIOUS_AGENTS_LINE, DEFAULT_AGENTS_LINE);
  }
  if (nextContent.includes(DEFAULT_AGENTS_LINE)) {
    fs.writeFileSync(filePath, nextContent, "utf8");
    return;
  }
  const trimmed = nextContent.trimEnd();
  if (!trimmed) {
    fs.writeFileSync(filePath, DEFAULT_AGENTS_CONTENT, "utf8");
    return;
  }
  const next = `${trimmed}\n\n${DEFAULT_AGENTS_LINE}\n`;
  fs.writeFileSync(filePath, next, "utf8");
};

const deleteFileIfExists = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return;
  }
  fs.rmSync(filePath);
};

export const readWorkspaceFile = (workspaceDir: string, name: WorkspaceFileName) => {
  const filePath = path.join(workspaceDir, name);
  if (!fs.existsSync(filePath)) {
    return { name, content: "", exists: false };
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${name} exists but is not a file.`);
  }
  return { name, content: fs.readFileSync(filePath, "utf8"), exists: true };
};

export const readWorkspaceFiles = (workspaceDir: string) =>
  WORKSPACE_FILE_NAMES.map((name) => readWorkspaceFile(workspaceDir, name));

export type WorkspaceFilesWriteResult =
  | { ok: true; files: Array<{ name: WorkspaceFileName; content: string; exists: boolean }> }
  | { ok: false; error: string };

export const writeWorkspaceFiles = (
  workspaceDir: string,
  files: Array<{ name: string; content: unknown }>
): WorkspaceFilesWriteResult => {
  for (const entry of files) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!name || !isWorkspaceFileName(name)) {
      return { ok: false, error: `Invalid file name: ${entry?.name ?? ""}` };
    }
    if (typeof entry.content !== "string") {
      return { ok: false, error: `Invalid content for ${name}.` };
    }
  }

  for (const entry of files) {
    const name = entry.name as WorkspaceFileName;
    const filePath = path.join(workspaceDir, name);
    fs.writeFileSync(filePath, entry.content as string, "utf8");
  }

  return { ok: true, files: readWorkspaceFiles(workspaceDir) };
};

export const provisionWorkspaceFiles = (workspaceDir: string): { warnings: string[] } => {
  const warnings: string[] = [];
  ensureDir(workspaceDir);
  deleteFileIfExists(path.join(workspaceDir, "BOOTSTRAP.md"));

  ensureAgentsFile(workspaceDir);
  for (const name of WORKSPACE_FILE_NAMES) {
    if (name === "AGENTS.md") continue;
    ensureFile(path.join(workspaceDir, name), "");
  }

  ensureDir(path.join(workspaceDir, "memory"));
  return { warnings };
};
