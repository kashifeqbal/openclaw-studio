import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import type { GatewayStatus } from "@/lib/gateway/GatewayClient";
import { isLocalGatewayUrl } from "@/lib/gateway/local-gateway";
import type { StudioGatewaySettings } from "@/lib/studio/settings";

type GatewayConnectScreenProps = {
  gatewayUrl: string;
  token: string;
  localGatewayDefaults: StudioGatewaySettings | null;
  status: GatewayStatus;
  error: string | null;
  onGatewayUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onUseLocalDefaults: () => void;
  onConnect: () => void;
};

const resolveLocalGatewayPort = (gatewayUrl: string): number => {
  try {
    const parsed = new URL(gatewayUrl);
    const port = Number(parsed.port);
    if (Number.isFinite(port) && port > 0) return port;
  } catch {}
  return 18789;
};

export const GatewayConnectScreen = ({
  gatewayUrl,
  token,
  localGatewayDefaults,
  status,
  error,
  onGatewayUrlChange,
  onTokenChange,
  onUseLocalDefaults,
  onConnect,
}: GatewayConnectScreenProps) => {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [remoteExpanded, setRemoteExpanded] = useState(false);
  const [localExpanded, setLocalExpanded] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const isLocal = useMemo(() => isLocalGatewayUrl(gatewayUrl), [gatewayUrl]);
  const localPort = useMemo(() => resolveLocalGatewayPort(gatewayUrl), [gatewayUrl]);
  const localGatewayCommand = useMemo(
    () => `npx openclaw gateway run --bind loopback --port ${localPort} --verbose`,
    [localPort]
  );
  const localGatewayCommandPnpm = useMemo(
    () => `pnpm openclaw gateway run --bind loopback --port ${localPort} --verbose`,
    [localPort]
  );
  const statusCopy = useMemo(() => {
    if (status === "connecting" && isLocal) {
      return `Local gateway detected on port ${localPort}. Connecting…`;
    }
    if (status === "connecting") {
      return "Connecting to remote gateway…";
    }
    if (isLocal) {
      return "No local gateway found.";
    }
    return "Not connected to a gateway.";
  }, [isLocal, localPort, status]);
  const hidePaths = status === "connecting" && isLocal;
  const connectDisabled = status === "connecting";
  const connectLabel = connectDisabled ? "Connecting…" : "Connect";

  const copyLocalCommand = async () => {
    try {
      await navigator.clipboard.writeText(localGatewayCommand);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 1200);
    } catch {
      setCopyStatus("failed");
      window.setTimeout(() => setCopyStatus("idle"), 1800);
    }
  };

  const commandField = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 rounded-md border border-zinc-700/70 bg-zinc-900/95 px-3 py-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-zinc-100">
          {localGatewayCommand}
        </code>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-600/80 bg-zinc-800 text-zinc-100 transition hover:bg-zinc-700"
          onClick={copyLocalCommand}
          aria-label="Copy local gateway command"
          title="Copy command"
        >
          {copyStatus === "copied" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      {copyStatus === "copied" ? (
        <p className="text-xs text-muted-foreground">Copied</p>
      ) : copyStatus === "failed" ? (
        <p className="text-xs text-destructive">Could not copy command.</p>
      ) : (
        <p className="text-xs leading-snug text-muted-foreground">
          In a source checkout, use <span className="font-mono">{localGatewayCommandPnpm}</span>.
        </p>
      )}
    </div>
  );

  const remoteForm = (
    <div className="mt-2.5 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/80">
        Upstream URL
        <input
          className="h-10 rounded-md border border-input/70 bg-background/75 px-4 font-sans text-sm text-foreground outline-none transition hover:border-input focus:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25"
          type="text"
          value={gatewayUrl}
          onChange={(event) => onGatewayUrlChange(event.target.value)}
          placeholder="wss://your-gateway.example.com"
          spellCheck={false}
        />
      </label>

      <div className="space-y-0.5 text-xs text-muted-foreground/90">
        <p className="font-medium text-foreground/85">Using Tailscale?</p>
        <p>
          URL: <span className="font-mono">wss://&lt;your-tailnet-host&gt;</span>
        </p>
        <p>Token: your gateway token</p>
      </div>

      <label className="flex flex-col gap-1 text-[11px] font-medium text-foreground/80">
        Upstream Token
        <div className="relative">
          <input
            className="h-10 w-full rounded-md border border-input/70 bg-background/75 px-4 pr-10 font-sans text-sm text-foreground outline-none transition hover:border-input focus:border-primary/70 focus-visible:ring-2 focus-visible:ring-primary/25"
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(event) => onTokenChange(event.target.value)}
            placeholder="gateway token"
            spellCheck={false}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-1 my-auto inline-flex h-8 w-8 items-center justify-center rounded text-muted-foreground transition-all hover:text-foreground"
            aria-label={showToken ? "Hide token" : "Show token"}
            onClick={() => setShowToken((prev) => !prev)}
          >
            {showToken ? (
              <EyeOff className="h-4 w-4 transition-transform duration-150" />
            ) : (
              <Eye className="h-4 w-4 transition-transform duration-150" />
            )}
          </button>
        </div>
      </label>
      <p className="text-xs text-muted-foreground">Keep this token secret.</p>

      <button
        type="button"
        className="mt-1 h-11 w-full rounded-md bg-primary px-4 text-xs font-semibold uppercase tracking-[0.1em] text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onConnect}
        disabled={connectDisabled || !gatewayUrl.trim()}
      >
        {connectLabel}
      </button>

      {status === "connecting" ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Connecting…
        </p>
      ) : null}
      {error ? <p className="text-xs leading-snug text-destructive">{error}</p> : null}
    </div>
  );

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[820px] flex-1 flex-col gap-5">
      <div className="rounded-sm border border-border/70 bg-muted/90 px-4 py-2">
        <div className="flex items-center gap-2">
          {status === "connecting" ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <span
              className={`h-2.5 w-2.5 rounded-full ${isLocal ? "bg-destructive" : "bg-amber-500"}`}
            />
          )}
          <p className="text-sm font-semibold text-foreground">{statusCopy}</p>
        </div>
      </div>

      {hidePaths ? null : isLocal ? (
        <>
          <div className="rounded-lg border border-border/45 bg-card/65 px-4 py-4 sm:px-6 sm:py-5">
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Local Gateway
              </p>
              <p className="text-sm text-foreground/85">
                Run locally, or connect to a remote gateway.
              </p>
            </div>
            {commandField}
            <button
              type="button"
              className="h-11 w-full rounded-md bg-primary px-4 text-xs font-semibold uppercase tracking-[0.1em] text-primary-foreground transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onConnect}
              disabled={connectDisabled}
            >
              {connectLabel}
            </button>
            {status === "connecting" ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Connecting…
              </p>
            ) : null}
            {error ? <p className="text-xs leading-snug text-destructive">{error}</p> : null}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-4 py-3.5 sm:px-6 sm:py-4">
            <button
              type="button"
              className="flex h-9 w-full items-center justify-between rounded-md border border-input/55 bg-background/65 px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition hover:border-input/75 hover:bg-muted/40"
              onClick={() => setRemoteExpanded((prev) => !prev)}
            >
              Remote Gateway
              {remoteExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {remoteExpanded ? remoteForm : null}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-border/45 bg-card/65 px-4 py-5 sm:px-6">
            <div>
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Remote Gateway
              </p>
              <p className="mt-2 text-sm text-foreground/85">Enter your URL and token to connect.</p>
            </div>
            {remoteForm}
          </div>

          <div className="rounded-lg border border-border/40 bg-card/60 px-4 py-3.5 sm:px-6 sm:py-4">
            <button
              type="button"
              className="flex h-9 w-full items-center justify-between rounded-md border border-input/55 bg-background/65 px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition hover:border-input/75 hover:bg-muted/40"
              onClick={() => setLocalExpanded((prev) => !prev)}
            >
              Run locally
              {localExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {localExpanded ? (
              <div className="mt-3 space-y-3">
                {commandField}
                {localGatewayDefaults ? (
                  <div className="rounded-md border border-input/60 bg-background/50 px-3 py-3">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Use token from <span className="font-mono">~/.openclaw/openclaw.json</span>.
                      </p>
                      <p className="font-mono text-[11px] text-foreground/85">
                        {localGatewayDefaults.url}
                      </p>
                      <button
                        type="button"
                        className="h-9 w-full rounded-md border border-input/70 bg-background/75 px-3 text-xs font-semibold uppercase tracking-[0.08em] text-foreground transition hover:border-input"
                        onClick={onUseLocalDefaults}
                      >
                        Use local defaults
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
};
