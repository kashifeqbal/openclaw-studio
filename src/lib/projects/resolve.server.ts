import { NextResponse } from "next/server";

import type { Project, ProjectTile, ProjectsStore } from "@/lib/projects/types";
import { loadStore } from "@/app/api/projects/store";

export type ResolveError = { status: number; message: string };

export type ResolveProjectResult =
  | { ok: true; projectId: string; project: Project }
  | { ok: false; error: ResolveError };

export type ResolveProjectTileResult =
  | { ok: true; projectId: string; tileId: string; project: Project; tile: ProjectTile }
  | { ok: false; error: ResolveError };

export type ProjectResolveResponse =
  | { ok: true; projectId: string; project: Project }
  | { ok: false; response: NextResponse };

export type ProjectTileResolveResponse =
  | { ok: true; projectId: string; tileId: string; project: Project; tile: ProjectTile }
  | { ok: false; response: NextResponse };

export type ProjectResolveWithStoreResponse =
  | { ok: true; store: ProjectsStore; projectId: string; project: Project }
  | { ok: false; response: NextResponse };

export type ProjectTileResolveWithStoreResponse =
  | {
      ok: true;
      store: ProjectsStore;
      projectId: string;
      tileId: string;
      project: Project;
      tile: ProjectTile;
    }
  | { ok: false; response: NextResponse };

export const resolveProject = (
  store: ProjectsStore,
  projectId: string
): ResolveProjectResult => {
  const trimmedProjectId = projectId.trim();
  if (!trimmedProjectId) {
    return {
      ok: false,
      error: { status: 400, message: "Workspace id is required." },
    };
  }
  const project = store.projects.find((entry) => entry.id === trimmedProjectId);
  if (!project) {
    return {
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    };
  }
  return { ok: true, projectId: trimmedProjectId, project };
};

export const resolveProjectTile = (
  store: ProjectsStore,
  projectId: string,
  tileId: string
): ResolveProjectTileResult => {
  const trimmedProjectId = projectId.trim();
  const trimmedTileId = tileId.trim();
  if (!trimmedProjectId || !trimmedTileId) {
    return {
      ok: false,
      error: { status: 400, message: "Workspace id and tile id are required." },
    };
  }
  const project = store.projects.find((entry) => entry.id === trimmedProjectId);
  if (!project) {
    return {
      ok: false,
      error: { status: 404, message: "Workspace not found." },
    };
  }
  const tile = project.tiles.find((entry) => entry.id === trimmedTileId);
  if (!tile) {
    return {
      ok: false,
      error: { status: 404, message: "Tile not found." },
    };
  }
  return { ok: true, projectId: trimmedProjectId, tileId: trimmedTileId, project, tile };
};

export const resolveProjectOrResponse = (
  store: ProjectsStore,
  projectId: string
): ProjectResolveResponse => {
  const resolved = resolveProject(store, projectId);
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status }
      ),
    };
  }
  return resolved;
};

export const resolveProjectTileOrResponse = (
  store: ProjectsStore,
  projectId: string,
  tileId: string
): ProjectTileResolveResponse => {
  const resolved = resolveProjectTile(store, projectId, tileId);
  if (!resolved.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: resolved.error.message },
        { status: resolved.error.status }
      ),
    };
  }
  return resolved;
};

export const resolveProjectFromParams = async (
  params: Promise<{ projectId: string }>
): Promise<ProjectResolveWithStoreResponse> => {
  const { projectId } = await params;
  const store = loadStore();
  const resolved = resolveProjectOrResponse(store, projectId);
  if (!resolved.ok) {
    return resolved;
  }
  return { ok: true, store, projectId: resolved.projectId, project: resolved.project };
};

export const resolveProjectTileFromParams = async (
  params: Promise<{ projectId: string; tileId: string }>
): Promise<ProjectTileResolveWithStoreResponse> => {
  const { projectId, tileId } = await params;
  const store = loadStore();
  const resolved = resolveProjectTileOrResponse(store, projectId, tileId);
  if (!resolved.ok) {
    return resolved;
  }
  return {
    ok: true,
    store,
    projectId: resolved.projectId,
    tileId: resolved.tileId,
    project: resolved.project,
    tile: resolved.tile,
  };
};
