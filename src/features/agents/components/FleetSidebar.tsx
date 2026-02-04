import type { AgentState, FocusFilter } from "@/features/agents/state/store";
import { getAttentionForAgent } from "@/features/agents/state/store";
import { AgentAvatar } from "./AgentAvatar";

type FleetSidebarProps = {
  agents: AgentState[];
  selectedAgentId: string | null;
  filter: FocusFilter;
  onFilterChange: (next: FocusFilter) => void;
  onSelectAgent: (agentId: string) => void;
};

const FILTER_OPTIONS: Array<{ value: FocusFilter; label: string; testId: string }> = [
  { value: "all", label: "All", testId: "fleet-filter-all" },
  {
    value: "needs-attention",
    label: "Needs Attention",
    testId: "fleet-filter-needs-attention",
  },
  { value: "running", label: "Running", testId: "fleet-filter-running" },
  { value: "idle", label: "Idle", testId: "fleet-filter-idle" },
];

const statusLabel: Record<AgentState["status"], string> = {
  idle: "Idle",
  running: "Running",
  error: "Error",
};

const statusClassName: Record<AgentState["status"], string> = {
  idle: "bg-accent text-accent-foreground border border-border",
  running: "bg-primary text-primary-foreground",
  error: "bg-destructive text-destructive-foreground",
};

export const FleetSidebar = ({
  agents,
  selectedAgentId,
  filter,
  onFilterChange,
  onSelectAgent,
}: FleetSidebarProps) => {
  return (
    <aside
      className="glass-panel fade-up-delay relative flex h-full w-full min-w-72 flex-col gap-3 p-3 xl:max-w-[320px]"
      data-testid="fleet-sidebar"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(90deg,color-mix(in_oklch,var(--primary)_18%,transparent)_0%,transparent_80%)]" />
      <div className="px-1">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Fleet
        </p>
        <p className="console-title text-2xl leading-none text-foreground">Agents ({agents.length})</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              data-testid={option.testId}
              aria-pressed={active}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.13em] transition ${
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border/80 bg-card/70 text-muted-foreground hover:border-primary/50 hover:bg-card"
              }`}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {agents.length === 0 ? (
          <div className="rounded-md border border-border/80 bg-card/75 p-3 text-xs text-muted-foreground">
            No agents available.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {agents.map((agent) => {
              const selected = selectedAgentId === agent.agentId;
              const attention = getAttentionForAgent(agent, selectedAgentId);
              const avatarSeed = agent.avatarSeed ?? agent.agentId;
              return (
                <button
                  key={agent.agentId}
                  type="button"
                  data-testid={`fleet-agent-row-${agent.agentId}`}
                  className={`group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                    selected
                      ? "border-primary/80 bg-primary/10 shadow-sm"
                      : "border-border/70 bg-card/65 hover:border-primary/40 hover:bg-card"
                  }`}
                  onClick={() => onSelectAgent(agent.agentId)}
                >
                  <AgentAvatar
                    seed={avatarSeed}
                    name={agent.name}
                    avatarUrl={agent.avatarUrl ?? null}
                    size={28}
                    isSelected={selected}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.13em] text-foreground">
                      {agent.name}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] ${statusClassName[agent.status]}`}
                      >
                        {statusLabel[agent.status]}
                      </span>
                      {attention === "needs-attention" ? (
                        <span className="rounded border border-border/80 bg-card/75 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          Attention
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
