import type { GatewayStatus } from "@/lib/gateway/GatewayClient";

type ConnectionPanelProps = {
  gatewayUrl: string;
  token: string;
  status: GatewayStatus;
  error: string | null;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

const statusStyles: Record<GatewayStatus, { label: string; className: string }> =
  {
    disconnected: {
      label: "Disconnected",
      className: "bg-muted text-muted-foreground",
    },
    connecting: {
      label: "Connecting",
      className: "bg-secondary text-secondary-foreground",
    },
    connected: {
      label: "Connected",
      className: "bg-primary text-primary-foreground",
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
}: ConnectionPanelProps) => {
  const statusConfig = statusStyles[status];
  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-lg px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusConfig.className}`}
        >
          {statusConfig.label}
        </span>
        <button
          className="rounded-lg border border-input px-4 py-2 text-sm font-semibold text-foreground transition hover:border-ring disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={isConnected ? onDisconnect : onConnect}
          disabled={isConnecting || !gatewayUrl.trim()}
        >
          {isConnected ? "Disconnect" : "Connect"}
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Gateway URL
          <input
            className="h-10 rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring"
            type="text"
            value={gatewayUrl}
            onChange={(event) => onGatewayUrlChange(event.target.value)}
            placeholder="ws://127.0.0.1:18789"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Token
          <input
            className="h-10 rounded-lg border border-input bg-background px-4 text-sm text-foreground outline-none transition focus:border-ring"
            type="password"
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="gateway token"
            spellCheck={false}
          />
        </label>
      </div>
      {error ? (
        <p className="rounded-lg border border-destructive bg-destructive px-4 py-2 text-sm text-destructive-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
};
