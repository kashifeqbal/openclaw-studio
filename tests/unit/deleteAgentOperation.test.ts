import { describe, expect, it, vi, beforeEach } from "vitest";

import { removeCronJobsForAgent } from "@/lib/cron/types";
import { deleteGatewayAgent } from "@/lib/gateway/agentConfig";
import { deleteAgentViaStudio } from "@/features/agents/operations/deleteAgentOperation";

vi.mock("@/lib/cron/types", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cron/types")>("@/lib/cron/types");
  return { ...actual, removeCronJobsForAgent: vi.fn() };
});

vi.mock("@/lib/gateway/agentConfig", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gateway/agentConfig")>(
    "@/lib/gateway/agentConfig"
  );
  return { ...actual, deleteGatewayAgent: vi.fn() };
});

type FetchJson = <T>(input: RequestInfo | URL, init?: RequestInit) => Promise<T>;

const createTrashResult = (overrides?: {
  trashDir?: string;
  moved?: Array<{ from: string; to: string }>;
}) => ({
  trashDir: "/tmp/trash",
  moved: [],
  ...(overrides ?? {}),
});

describe("delete agent via studio operation", () => {
  const mockedRemoveCronJobsForAgent = vi.mocked(removeCronJobsForAgent);
  const mockedDeleteGatewayAgent = vi.mocked(deleteGatewayAgent);

  beforeEach(() => {
    mockedRemoveCronJobsForAgent.mockReset();
    mockedDeleteGatewayAgent.mockReset();
  });

  it("runs_steps_in_order_on_success", async () => {
    const calls: string[] = [];
    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        calls.push("trash");
        return { result: createTrashResult() } as never;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      calls.push("removeCron");
      return 0;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      calls.push("deleteGatewayAgent");
      return { removed: true, removedBindings: 0 };
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).resolves.toEqual({
      trashed: createTrashResult(),
      restored: null,
    });

    expect(calls).toEqual(["trash", "removeCron", "deleteGatewayAgent"]);
  });

  it("attempts_restore_when_remove_cron_fails_and_trash_moved_paths", async () => {
    const calls: string[] = [];
    const originalErr = new Error("boom");
    const trash = createTrashResult({
      trashDir: "/tmp/trash-2",
      moved: [{ from: "/a", to: "/b" }],
    });

    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        calls.push("trash");
        return { result: trash } as never;
      }
      if (init?.method === "PUT") {
        calls.push("restore:agent-1:/tmp/trash-2");
        return { result: { restored: [] } } as never;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      calls.push("removeCron");
      throw originalErr;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      calls.push("deleteGatewayAgent");
      return { removed: true, removedBindings: 0 };
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).rejects.toBe(originalErr);

    expect(calls).toEqual(["trash", "removeCron", "restore:agent-1:/tmp/trash-2"]);
    expect(mockedDeleteGatewayAgent).not.toHaveBeenCalled();
  });

  it("attempts_restore_when_gateway_delete_fails_and_trash_moved_paths", async () => {
    const calls: string[] = [];
    const originalErr = new Error("boom");

    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        calls.push("trash");
        return {
          result: createTrashResult({
            trashDir: "/tmp/trash-3",
            moved: [{ from: "/a", to: "/b" }],
          }),
        } as never;
      }
      if (init?.method === "PUT") {
        calls.push("restore:agent-1:/tmp/trash-3");
        return { result: { restored: [] } } as never;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      calls.push("removeCron");
      return 0;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      calls.push("deleteGatewayAgent");
      throw originalErr;
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).rejects.toBe(originalErr);

    expect(calls).toEqual([
      "trash",
      "removeCron",
      "deleteGatewayAgent",
      "restore:agent-1:/tmp/trash-3",
    ]);
  });

  it("does_not_restore_when_trash_moved_is_empty", async () => {
    const originalErr = new Error("boom");
    const methods: string[] = [];

    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (method === "POST") {
        return { result: createTrashResult({ moved: [] }) } as never;
      }
      if (method === "PUT") {
        throw new Error("restore should not be called");
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      throw originalErr;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      return { removed: true, removedBindings: 0 };
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "agent-1", fetchJson })
    ).rejects.toBe(originalErr);

    expect(methods).toEqual(["POST"]);
    expect(mockedDeleteGatewayAgent).not.toHaveBeenCalled();
  });

  it("logs_restore_failure_and_still_throws_original_error", async () => {
    const originalErr = new Error("boom");
    const restoreErr = new Error("restore-failed");
    const logError = vi.fn();

    const fetchJson: FetchJson = vi.fn(async (_input, init) => {
      if (init?.method === "POST") {
        return {
          result: createTrashResult({
            trashDir: "/tmp/trash-4",
            moved: [{ from: "/a", to: "/b" }],
          }),
        } as never;
      }
      if (init?.method === "PUT") {
        throw restoreErr;
      }
      throw new Error("Unexpected fetchJson call");
    });

    mockedRemoveCronJobsForAgent.mockImplementation(async () => {
      return 0;
    });
    mockedDeleteGatewayAgent.mockImplementation(async () => {
      throw originalErr;
    });

    await expect(
      deleteAgentViaStudio({
        client: {} as never,
        agentId: "agent-1",
        fetchJson,
        logError,
      })
    ).rejects.toBe(originalErr);

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith("Failed to restore trashed agent state.", restoreErr);
  });

  it("fails_fast_when_agent_id_is_missing", async () => {
    const fetchJson: FetchJson = vi.fn(async () => {
      throw new Error("fetch should not be called");
    });

    await expect(
      deleteAgentViaStudio({ client: {} as never, agentId: "   ", fetchJson })
    ).rejects.toThrow("Agent id is required.");

    expect(fetchJson).not.toHaveBeenCalled();
    expect(mockedRemoveCronJobsForAgent).not.toHaveBeenCalled();
    expect(mockedDeleteGatewayAgent).not.toHaveBeenCalled();
  });
});
