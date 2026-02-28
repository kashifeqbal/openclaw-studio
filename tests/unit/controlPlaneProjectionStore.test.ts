// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SQLiteControlPlaneProjectionStore } from "@/lib/controlplane/projection-store";

describe("SQLiteControlPlaneProjectionStore", () => {
  let tempDir: string | null = null;

  const makeDbPath = () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "controlplane-store-"));
    return path.join(tempDir, "runtime.db");
  };

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("reuses same schema across restarts and preserves snapshot", () => {
    const dbPath = makeDbPath();
    const first = new SQLiteControlPlaneProjectionStore(dbPath);
    first.applyDomainEvent({
      type: "runtime.status",
      status: "connected",
      reason: null,
      asOf: "2026-02-28T02:00:00.000Z",
    });
    first.close();

    const second = new SQLiteControlPlaneProjectionStore(dbPath);
    const snapshot = second.snapshot();
    expect(snapshot.status).toBe("connected");
    expect(snapshot.asOf).toBe("2026-02-28T02:00:00.000Z");
    expect(snapshot.outboxHead).toBe(1);
    second.close();
  });

  it("deduplicates reapplied events and keeps outbox ordering", () => {
    const store = new SQLiteControlPlaneProjectionStore(makeDbPath());
    const firstEvent = {
      type: "gateway.event" as const,
      event: "runtime.delta",
      seq: 42,
      payload: { content: "a" },
      asOf: "2026-02-28T02:01:00.000Z",
    };
    const secondEvent = {
      type: "gateway.event" as const,
      event: "runtime.final",
      seq: 43,
      payload: { content: "b" },
      asOf: "2026-02-28T02:01:02.000Z",
    };

    const first = store.applyDomainEvent(firstEvent);
    const duplicate = store.applyDomainEvent(firstEvent);
    const replayedWithNewTimestamp = store.applyDomainEvent({
      ...firstEvent,
      asOf: "2026-02-28T02:01:05.000Z",
    });
    const second = store.applyDomainEvent(secondEvent);

    expect(first.id).toBe(1);
    expect(duplicate.id).toBe(1);
    expect(replayedWithNewTimestamp.id).toBe(1);
    expect(second.id).toBe(2);

    const replay = store.readOutboxAfter(0, 10);
    expect(replay.map((entry) => entry.id)).toEqual([1, 2]);
    expect(replay[0]?.event).toEqual(firstEvent);
    expect(replay[1]?.event).toEqual(secondEvent);

    store.close();
  });
});
