import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgentState } from "@/features/agents/state/store";
import { AgentBrainPanel } from "@/features/agents/components/AgentBrainPanel";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

const createAgent = (agentId: string, name: string, sessionKey: string): AgentState => ({
  agentId,
  name,
  sessionKey,
  status: "idle",
  sessionCreated: true,
  awaitingUserInput: false,
  hasUnseenActivity: false,
  outputLines: [],
  lastResult: null,
  lastDiff: null,
  runId: null,
  streamText: null,
  thinkingTrace: null,
  latestOverride: null,
  latestOverrideKind: null,
  lastAssistantMessageAt: null,
  lastActivityAt: null,
  latestPreview: null,
  lastUserMessage: null,
  draft: "",
  sessionSettingsSynced: true,
  historyLoadedAt: null,
  toolCallingEnabled: true,
  showThinkingTraces: true,
  model: null,
  thinkingLevel: null,
  avatarSeed: `seed-${agentId}`,
  avatarUrl: null,
});

const createMockClient = () => {
  const filesByAgent: Record<string, Record<string, string>> = {
    "agent-1": { "AGENTS.md": "alpha agents" },
    "agent-2": { "AGENTS.md": "beta agents" },
  };

  const calls: Array<{ method: string; params: unknown }> = [];

  const client = {
    call: vi.fn(async (method: string, params: unknown) => {
      calls.push({ method, params });
      if (method === "agents.files.get") {
        const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const name = typeof record.name === "string" ? record.name : "";
        const content = filesByAgent[agentId]?.[name];
        if (typeof content !== "string") {
          return { file: { name, missing: true } };
        }
        return { file: { name, missing: false, content } };
      }
      if (method === "agents.files.set") {
        const record = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
        const agentId = typeof record.agentId === "string" ? record.agentId : "";
        const name = typeof record.name === "string" ? record.name : "";
        const content = typeof record.content === "string" ? record.content : "";
        if (!filesByAgent[agentId]) {
          filesByAgent[agentId] = {};
        }
        filesByAgent[agentId][name] = content;
        return { ok: true };
      }
      return {};
    }),
  } as unknown as GatewayClient;

  return { client, calls, filesByAgent };
};

describe("AgentBrainPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders_selected_agent_file_tabs", async () => {
    const { client } = createMockClient();
    const agents = [
      createAgent("agent-1", "Alpha", "session-1"),
      createAgent("agent-2", "Beta", "session-2"),
    ];

    render(
      createElement(AgentBrainPanel, {
        client,
        agents,
        selectedAgentId: "agent-1",
        onClose: vi.fn(),
      })
    );

    expect(screen.getByRole("button", { name: "AGENTS" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("alpha agents")).toBeInTheDocument();
    });
  });

  it("shows_actionable_message_when_session_key_missing", async () => {
    const { client } = createMockClient();
    const agents = [createAgent("", "Alpha", "session-1")];

    render(
      createElement(AgentBrainPanel, {
        client,
        agents,
        selectedAgentId: "",
        onClose: vi.fn(),
      })
    );

    await waitFor(() => {
      expect(screen.getByText("Agent ID is missing for this agent.")).toBeInTheDocument();
    });
  });

  it("saves_dirty_changes_before_close", async () => {
    const { client, calls } = createMockClient();
    const agents = [createAgent("agent-1", "Alpha", "session-1")];
    const onClose = vi.fn();

    render(
      createElement(AgentBrainPanel, {
        client,
        agents,
        selectedAgentId: "agent-1",
        onClose,
      })
    );

    await screen.findByText("alpha agents");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const textarea = await screen.findByDisplayValue("alpha agents");
    fireEvent.change(textarea, { target: { value: "alpha agents updated" } });
    fireEvent.click(screen.getByTestId("agent-brain-close"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    expect(
      calls.some(
        (entry) =>
          entry.method === "agents.files.set" &&
          Boolean(
            entry.params &&
              typeof entry.params === "object" &&
              (entry.params as Record<string, unknown>).name === "AGENTS.md" &&
              (entry.params as Record<string, unknown>).content === "alpha agents updated"
          )
      )
    ).toBeTruthy();
  });
});
