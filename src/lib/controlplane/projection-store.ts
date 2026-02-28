import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

import type {
  ControlPlaneDomainEvent,
  ControlPlaneOutboxEntry,
  ControlPlaneRuntimeSnapshot,
} from "@/lib/controlplane/contracts";
import { deriveControlPlaneEventKey } from "@/lib/controlplane/outbox";
import { resolveStateDir } from "@/lib/clawdbot/paths";

const RUNTIME_DB_DIRNAME = "openclaw-studio";
const RUNTIME_DB_FILENAME = "runtime.db";

const DEFAULT_STATUS = "stopped" as const;

type OutboxRow = {
  id: number;
  event_json: string;
  created_at: string;
};

type ProjectionRow = {
  status: string;
  reason: string | null;
  as_of: string | null;
};

const parseDomainEvent = (raw: string): ControlPlaneDomainEvent => {
  return JSON.parse(raw) as ControlPlaneDomainEvent;
};

const toOutboxEntry = (row: OutboxRow): ControlPlaneOutboxEntry => {
  return {
    id: row.id,
    event: parseDomainEvent(row.event_json),
    createdAt: row.created_at,
  };
};

const resolveControlPlaneRuntimeDbPath = (): string =>
  path.join(resolveStateDir(), RUNTIME_DB_DIRNAME, RUNTIME_DB_FILENAME);

export class SQLiteControlPlaneProjectionStore {
  private readonly db: Database.Database;
  private readonly readProjectionStmt: Database.Statement<[], ProjectionRow | undefined>;
  private readonly readOutboxHeadStmt: Database.Statement<[], { head: number }>;
  private readonly readOutboxAfterStmt: Database.Statement<[number, number], OutboxRow>;
  private readonly readOutboxByIdStmt: Database.Statement<[number], OutboxRow | undefined>;
  private readonly readProcessedStmt: Database.Statement<[string], { outbox_id: number | null } | undefined>;
  private readonly insertProcessedStmt: Database.Statement<[string, string]>;
  private readonly insertOutboxStmt: Database.Statement<[string, string, string]>;
  private readonly updateProcessedOutboxStmt: Database.Statement<[number, string]>;
  private readonly upsertStatusProjectionStmt: Database.Statement<
    [string, string | null, string, string]
  >;
  private readonly upsertGatewayProjectionStmt: Database.Statement<[string, string]>;
  private readonly applyEventTx: (
    event: ControlPlaneDomainEvent,
    eventKey: string
  ) => ControlPlaneOutboxEntry;

  constructor(dbPath: string = resolveControlPlaneRuntimeDbPath()) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();

    this.readProjectionStmt = this.db.prepare(
      "SELECT status, reason, as_of FROM runtime_projection WHERE id = 1"
    );
    this.readOutboxHeadStmt = this.db.prepare("SELECT COALESCE(MAX(id), 0) AS head FROM outbox");
    this.readOutboxAfterStmt = this.db.prepare(
      "SELECT id, event_json, created_at FROM outbox WHERE id > ? ORDER BY id ASC LIMIT ?"
    );
    this.readOutboxByIdStmt = this.db.prepare(
      "SELECT id, event_json, created_at FROM outbox WHERE id = ?"
    );
    this.readProcessedStmt = this.db.prepare(
      "SELECT outbox_id FROM processed_events WHERE event_key = ?"
    );
    this.insertProcessedStmt = this.db.prepare(
      "INSERT OR IGNORE INTO processed_events (event_key, created_at) VALUES (?, ?)"
    );
    this.insertOutboxStmt = this.db.prepare(
      "INSERT INTO outbox (event_type, event_json, created_at) VALUES (?, ?, ?)"
    );
    this.updateProcessedOutboxStmt = this.db.prepare(
      "UPDATE processed_events SET outbox_id = ? WHERE event_key = ?"
    );
    this.upsertStatusProjectionStmt = this.db.prepare(`
      INSERT INTO runtime_projection (id, status, reason, as_of, updated_at)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        reason = excluded.reason,
        as_of = excluded.as_of,
        updated_at = excluded.updated_at
    `);
    this.upsertGatewayProjectionStmt = this.db.prepare(`
      INSERT INTO runtime_projection (id, status, reason, as_of, updated_at)
      VALUES (1, '${DEFAULT_STATUS}', NULL, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        as_of = excluded.as_of,
        updated_at = excluded.updated_at
    `);

    this.applyEventTx = this.db.transaction((event: ControlPlaneDomainEvent, eventKey: string) => {
      const existing = this.readProcessedStmt.get(eventKey);
      if (existing?.outbox_id) {
        const row = this.readOutboxByIdStmt.get(existing.outbox_id);
        if (!row) {
          throw new Error(`Outbox row missing for processed event key: ${eventKey}`);
        }
        return toOutboxEntry(row);
      }

      const now = new Date().toISOString();
      this.insertProcessedStmt.run(eventKey, now);

      if (event.type === "runtime.status") {
        this.upsertStatusProjectionStmt.run(event.status, event.reason ?? null, event.asOf, now);
      } else {
        this.upsertGatewayProjectionStmt.run(event.asOf, now);
      }

      const info = this.insertOutboxStmt.run(event.type, JSON.stringify(event), now);
      const outboxId = Number(info.lastInsertRowid);
      this.updateProcessedOutboxStmt.run(outboxId, eventKey);

      const row = this.readOutboxByIdStmt.get(outboxId);
      if (!row) {
        throw new Error(`Failed to read inserted outbox row id=${outboxId}`);
      }
      return toOutboxEntry(row);
    });
  }

  applyDomainEvent(
    event: ControlPlaneDomainEvent,
    eventKey: string = deriveControlPlaneEventKey(event)
  ): ControlPlaneOutboxEntry {
    return this.applyEventTx(event, eventKey);
  }

  readOutboxAfter(lastSeenId: number, limit: number = 500): ControlPlaneOutboxEntry[] {
    const safeLastSeen = Number.isFinite(lastSeenId) && lastSeenId >= 0 ? lastSeenId : 0;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 500;
    return this.readOutboxAfterStmt.all(safeLastSeen, safeLimit).map(toOutboxEntry);
  }

  outboxHead(): number {
    const row = this.readOutboxHeadStmt.get();
    return row?.head ?? 0;
  }

  snapshot(): ControlPlaneRuntimeSnapshot {
    const projection = this.readProjectionStmt.get();
    const outboxHead = this.outboxHead();
    if (!projection) {
      return {
        status: DEFAULT_STATUS,
        reason: null,
        asOf: null,
        outboxHead,
      };
    }
    return {
      status: projection.status as ControlPlaneRuntimeSnapshot["status"],
      reason: projection.reason,
      asOf: projection.as_of,
      outboxHead,
    };
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runtime_projection (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        reason TEXT,
        as_of TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS processed_events (
        event_key TEXT PRIMARY KEY,
        outbox_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (outbox_id) REFERENCES outbox(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_outbox_id ON outbox(id);
    `);
    const version = Number(this.db.pragma("user_version", { simple: true }));
    if (version < 1) {
      this.db.pragma("user_version = 1");
    }
  }
}
