import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { X } from "lucide-react";

type ConnectionPanelProps = {
  gatewayUrl: string;
  token: string;
  status: GatewayStatus;
  error: string | null;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose?: () => void;
};

const statusStyles: Record<GatewayStatus, { label: string; className: string }> = {
  disconnected: {
    label: "Disconnected",
    className: "ui-chip border-border/70 bg-muted px-3 py-1 text-muted-foreground",
  },
  connecting: {
    label: "Connecting",
    className: "ui-chip border-border/70 bg-secondary px-3 py-1 text-secondary-foreground",
  },
  connected: {
    label: "Connected",
    className: "ui-chip border-primary/30 bg-primary/15 px-3 py-1 text-foreground",
  },
};

export const ConnectionPanel = ({
  gatewayUrl,
  token,
  status,
  error,
  onGatewayUrlChange,
  onTokenChange,
  onConnect,
  onDisconnect,
  onClose,
}: ConnectionPanelProps) => {
  const statusConfig = statusStyles[status];
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="fade-up-delay flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center font-mono text-[10px] font-semibold tracking-[0.08em] ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
          <button
            className="ui-btn-secondary px-4 py-2 text-xs font-semibold tracking-[0.05em] text-foreground disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            onClick={isConnected ? onDisconnect : onConnect}
            disabled={isConnecting || !gatewayUrl.trim()}
          >
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
        {onClose ? (
          <button
            className="ui-btn-ghost inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold tracking-[0.05em] text-foreground"
            type="button"
            onClick={onClose}
            data-testid="gateway-connection-close"
            aria-label="Close gateway connection panel"
          >
            <X className="h-3.5 w-3.5" />
            Close
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <label className="flex flex-col gap-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">
          Upstream gateway URL
          <input
            className="ui-input h-10 rounded-md px-4 font-sans text-sm text-foreground outline-none"
            type="text"
            value={gatewayUrl}
            onChange={(event) => onGatewayUrlChange(event.target.value)}
            placeholder="ws://localhost:18789"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 font-mono text-[10px] font-semibold tracking-[0.06em] text-muted-foreground">
          Upstream token
          <input
            className="ui-input h-10 rounded-md px-4 font-sans text-sm text-foreground outline-none"
            type="password"
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="gateway token"
            spellCheck={false}
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-md border border-destructive bg-destructive px-4 py-2 text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
};
