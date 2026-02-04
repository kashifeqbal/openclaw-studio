import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { ThemeToggle } from "@/components/theme-toggle";

type HeaderBarProps = {
  status: GatewayStatus;
  gatewayUrl: string;
  agentCount: number;
  onConnectionSettings: () => void;
};

const statusDotStyles: Record<GatewayStatus, string> = {
  disconnected: "bg-muted",
  connecting: "bg-secondary",
  connected: "bg-primary",
};

const statusLabel: Record<GatewayStatus, string> = {
  disconnected: "Disconnected",
  connecting: "Connecting",
  connected: "Connected",
};

export const HeaderBar = ({
  status,
  gatewayUrl,
  agentCount,
  onConnectionSettings,
}: HeaderBarProps) => {
  return (
    <div className="glass-panel fade-up relative overflow-hidden px-4 py-4 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,color-mix(in_oklch,var(--primary)_14%,transparent)_48%,transparent_100%)] opacity-70" />
      <div className="relative grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p className="console-title text-2xl leading-none text-foreground sm:text-3xl">
            OpenClaw Studio
          </p>
          <p className="mt-1 truncate text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Agents ({agentCount})
          </p>
          {gatewayUrl ? (
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground/90">
              {gatewayUrl}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="inline-flex items-center gap-2 rounded-md border border-border/80 bg-card/70 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <span
              className={`status-ping h-2 w-2 rounded-full ${statusDotStyles[status]}`}
              aria-hidden="true"
            />
            {statusLabel[status]}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              className="rounded-md border border-input/90 bg-background/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-foreground transition hover:border-ring hover:bg-card"
              type="button"
              onClick={onConnectionSettings}
              data-testid="gateway-settings-toggle"
            >
              Connection Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
