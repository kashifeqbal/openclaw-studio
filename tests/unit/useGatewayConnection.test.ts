import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const ORIGINAL_ENV = { ...process.env };

type ConnectOutcome = { kind: "success" } | { kind: "close"; code: number; reason: string };

const setupAndImportHook = async (
  gatewayUrl: string | null,
  options?: { outcomes?: ConnectOutcome[] }
) => {
  process.env = { ...ORIGINAL_ENV };
  if (gatewayUrl === null) {
    delete process.env.NEXT_PUBLIC_GATEWAY_URL;
  } else {
    process.env.NEXT_PUBLIC_GATEWAY_URL = gatewayUrl;
  }

  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.doMock("@/lib/gateway/gatewayReloadMode", () => ({
    ensureGatewayReloadModeHotForLocalStudio: async () => {},
  }));

  const outcomes = [...(options?.outcomes ?? [{ kind: "success" } as ConnectOutcome])];

  const captured: {
    url: string | null;
    token: unknown;
    authScopeKey: unknown;
    startCount: number;
  } = {
    url: null,
    token: null,
    authScopeKey: null,
    startCount: 0,
  };

  vi.doMock("../../src/lib/gateway/openclaw/GatewayBrowserClient", () => {
    class GatewayBrowserClient {
      connected = false;
      private opts: {
        onHello?: (hello: unknown) => void;
        onEvent?: (event: unknown) => void;
        onClose?: (info: { code: number; reason: string }) => void;
        onGap?: (info: { expected: number; received: number }) => void;
      };

      constructor(opts: Record<string, unknown>) {
        captured.url = typeof opts.url === "string" ? opts.url : null;
        captured.token = "token" in opts ? opts.token : null;
        captured.authScopeKey = "authScopeKey" in opts ? opts.authScopeKey : null;
        this.opts = {
          onHello: typeof opts.onHello === "function" ? (opts.onHello as (hello: unknown) => void) : undefined,
          onEvent: typeof opts.onEvent === "function" ? (opts.onEvent as (event: unknown) => void) : undefined,
          onClose: typeof opts.onClose === "function" ? (opts.onClose as (info: { code: number; reason: string }) => void) : undefined,
          onGap: typeof opts.onGap === "function" ? (opts.onGap as (info: { expected: number; received: number }) => void) : undefined,
        };
      }

      start() {
        captured.startCount += 1;
        const outcome = outcomes.shift() ?? { kind: "success" };
        if (outcome.kind === "success") {
          this.connected = true;
          this.opts.onHello?.({ type: "hello-ok", protocol: 1 });
          return;
        }
        this.connected = false;
        queueMicrotask(() => {
          this.opts.onClose?.({ code: outcome.code, reason: outcome.reason });
        });
      }

      stop() {
        this.connected = false;
        this.opts.onClose?.({ code: 1000, reason: "stopped" });
      }

      async request<T = unknown>(method: string, params: unknown): Promise<T> {
        void method;
        void params;
        return {} as T;
      }
    }

    return { GatewayBrowserClient };
  });

  const mod = await import("@/lib/gateway/GatewayClient");
  return {
    useGatewayConnection: mod.useGatewayConnection as (settingsCoordinator: {
      loadSettings: () => Promise<unknown>;
      loadSettingsEnvelope?: () => Promise<unknown>;
      schedulePatch: (patch: unknown) => void;
      flushPending: () => Promise<void>;
    }) => {
      gatewayUrl: string;
      token: string;
      localGatewayDefaults: { url: string; token: string } | null;
      status: "disconnected" | "connecting" | "connected";
      error: string | null;
      connect: () => Promise<void>;
      disconnect: () => void;
      useLocalGatewayDefaults: () => void;
    },
    captured,
  };
};

describe("useGatewayConnection", () => {
  afterEach(() => {
    cleanup();
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("defaults_to_env_url_when_set", async () => {
    const { useGatewayConnection } = await setupAndImportHook("ws://example.test:1234");
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () =>
      createElement(
        "div",
        { "data-testid": "gatewayUrl" },
        useGatewayConnection(coordinator).gatewayUrl
      );

    render(createElement(Probe));

    await waitFor(() => {
      expect(screen.getByTestId("gatewayUrl")).toHaveTextContent("ws://example.test:1234");
    });
  });

  it("falls_back_to_local_default_when_env_unset", async () => {
    const { useGatewayConnection } = await setupAndImportHook(null);
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () =>
      createElement(
        "div",
        { "data-testid": "gatewayUrl" },
        useGatewayConnection(coordinator).gatewayUrl
      );

    render(createElement(Probe));

    await waitFor(() => {
      expect(screen.getByTestId("gatewayUrl")).toHaveTextContent("ws://localhost:18789");
    });
  });

  it("connects_via_studio_proxy_ws_and_does_not_pass_token", async () => {
    const { useGatewayConnection, captured } = await setupAndImportHook(null);
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () => {
      useGatewayConnection(coordinator);
      return createElement("div", null, "ok");
    };

    render(createElement(Probe));

    await waitFor(() => {
      expect(captured.url).toBe("ws://localhost:3000/api/gateway/ws");
    });
    expect(captured.token).toBe("");
    expect(captured.authScopeKey).toBe("ws://localhost:18789");
  });

  it("applies_local_defaults_from_settings_envelope", async () => {
    const { useGatewayConnection } = await setupAndImportHook(null);
    const coordinator = {
      loadSettings: async () => ({
        version: 1,
        gateway: null,
        focused: {},
        avatars: {},
      }),
      loadSettingsEnvelope: async () => ({
        settings: {
          version: 1,
          gateway: { url: "wss://remote.example", token: "remote-token" },
          focused: {},
          avatars: {},
        },
        localGatewayDefaults: { url: "ws://localhost:18789", token: "local-token" },
      }),
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () => {
      const state = useGatewayConnection(coordinator);
      return createElement(
        "div",
        null,
        createElement("div", { "data-testid": "gatewayUrl" }, state.gatewayUrl),
        createElement("div", { "data-testid": "token" }, state.token),
        createElement(
          "div",
          { "data-testid": "localDefaultsUrl" },
          state.localGatewayDefaults?.url ?? ""
        ),
        createElement(
          "button",
          {
            type: "button",
            onClick: state.useLocalGatewayDefaults,
            "data-testid": "useLocalDefaults",
          },
          "use"
        )
      );
    };

    render(createElement(Probe));

    await waitFor(() => {
      expect(screen.getByTestId("gatewayUrl")).toHaveTextContent("wss://remote.example");
    });
    expect(screen.getByTestId("token")).toHaveTextContent("remote-token");
    expect(screen.getByTestId("localDefaultsUrl")).toHaveTextContent("ws://localhost:18789");

    fireEvent.click(screen.getByTestId("useLocalDefaults"));

    await waitFor(() => {
      expect(screen.getByTestId("gatewayUrl")).toHaveTextContent("ws://localhost:18789");
    });
    expect(screen.getByTestId("token")).toHaveTextContent("local-token");
  });

  it("retries_after_transient_connect_failure_and_recovers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { useGatewayConnection, captured } = await setupAndImportHook(null, {
      outcomes: [
        { kind: "close", code: 1012, reason: "gateway restart" },
        { kind: "success" },
      ],
    });
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () => {
      const state = useGatewayConnection(coordinator);
      return createElement(
        "div",
        null,
        createElement("div", { "data-testid": "status" }, state.status),
        createElement("div", { "data-testid": "error" }, state.error ?? "")
      );
    };

    render(createElement(Probe));

    await waitFor(() => {
      expect(captured.startCount).toBe(1);
    });
    expect(screen.getByTestId("status")).toHaveTextContent("disconnected");
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Gateway closed (1012): gateway restart"
    );

    await vi.advanceTimersByTimeAsync(2_000);

    await waitFor(() => {
      expect(captured.startCount).toBe(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("connected");
    });
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });

  it("does_not_retry_on_non_retryable_auth_connect_error", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { useGatewayConnection, captured } = await setupAndImportHook(null, {
      outcomes: [{ kind: "close", code: 4008, reason: "connect failed: FORBIDDEN invalid token" }],
    });
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () => {
      const state = useGatewayConnection(coordinator);
      return createElement("div", { "data-testid": "error" }, state.error ?? "");
    };

    render(createElement(Probe));

    await waitFor(() => {
      expect(captured.startCount).toBe(1);
    });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(captured.startCount).toBe(1);
    expect(screen.getByTestId("error")).toHaveTextContent(
      "Gateway closed (4008): connect failed: FORBIDDEN invalid token"
    );
  });

  it("does_not_auto_reconnect_after_manual_disconnect", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { useGatewayConnection, captured } = await setupAndImportHook(null, {
      outcomes: [{ kind: "success" }],
    });
    const coordinator = {
      loadSettings: async () => null,
      schedulePatch: () => {},
      flushPending: async () => {},
    };

    const Probe = () => {
      const state = useGatewayConnection(coordinator);
      return createElement(
        "div",
        null,
        createElement("div", { "data-testid": "status" }, state.status),
        createElement(
          "button",
          {
            type: "button",
            onClick: state.disconnect,
            "data-testid": "disconnect",
          },
          "disconnect"
        )
      );
    };

    render(createElement(Probe));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("connected");
    });
    expect(captured.startCount).toBe(1);

    fireEvent.click(screen.getByTestId("disconnect"));

    await waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("disconnected");
    });
    await vi.advanceTimersByTimeAsync(120_000);

    expect(captured.startCount).toBe(1);
  });

});
