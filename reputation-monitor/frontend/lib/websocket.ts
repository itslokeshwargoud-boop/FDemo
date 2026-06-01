/**
 * WebSocket helper for real-time live feed.
 *
 * Connects to ws://{host}/ws/live/{keyword}?token={jwt} on the backend.
 * Dispatches events to registered callbacks for `new_post` and `stats_update`.
 *
 * Usage:
 *   const ws = createLiveFeed({ keyword: "anil_ravipudi", token: "…" });
 *   ws.on("new_post", (data) => { ... });
 *   ws.on("stats_update", (data) => { ... });
 *   ws.connect();
 *   // later:
 *   ws.disconnect();
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LiveFeedOptions {
  /** Keyword / topic to monitor. */
  keyword: string;
  /** JWT token for authentication. If empty, connection will be refused. */
  token: string;
  /**
   * Backend WebSocket URL base.
   * Defaults to `ws://localhost:8000` — override via NEXT_PUBLIC_WS_URL env.
   */
  wsBaseUrl?: string;
  /** Auto-reconnect on disconnect (default: true). */
  autoReconnect?: boolean;
  /** Max reconnect attempts (default: 5). */
  maxReconnectAttempts?: number;
}

export type LiveEventType = "connected" | "new_post" | "stats_update" | "error" | "disconnected";

export type LiveEventCallback = (data: Record<string, unknown>) => void;

export interface LiveFeedConnection {
  connect: () => void;
  disconnect: () => void;
  on: (event: LiveEventType, cb: LiveEventCallback) => void;
  off: (event: LiveEventType, cb: LiveEventCallback) => void;
  readonly isConnected: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createLiveFeed(options: LiveFeedOptions): LiveFeedConnection {
  const {
    keyword,
    token,
    wsBaseUrl = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000",
    autoReconnect = true,
    maxReconnectAttempts = 5,
  } = options;

  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let connected = false;

  const listeners: Map<LiveEventType, Set<LiveEventCallback>> = new Map();

  function emit(event: LiveEventType, data: Record<string, unknown>) {
    const cbs = listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(data);
        } catch {
          // swallow listener errors
        }
      }
    }
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
      return;
    }

    if (!token) {
      emit("error", { message: "No JWT token provided — cannot open WebSocket." });
      return;
    }

    const url = `${wsBaseUrl}/ws/live/${encodeURIComponent(keyword)}?token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(url);
    } catch (err) {
      emit("error", { message: `WebSocket creation failed: ${err}` });
      return;
    }

    ws.onopen = () => {
      connected = true;
      reconnectAttempts = 0;
    };

    ws.onmessage = (evt) => {
      try {
        const payload = JSON.parse(evt.data) as Record<string, unknown>;
        const eventType = (payload.event as LiveEventType) ?? "stats_update";
        emit(eventType, payload);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      emit("error", { message: "WebSocket connection error" });
    };

    ws.onclose = () => {
      connected = false;
      emit("disconnected", { keyword });

      if (autoReconnect && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped) for attempts 1–5
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 30_000);
        reconnectTimer = setTimeout(connect, delay);
      }
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts = maxReconnectAttempts; // prevent auto-reconnect
    if (ws) {
      ws.close();
      ws = null;
    }
    connected = false;
  }

  function on(event: LiveEventType, cb: LiveEventCallback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
  }

  function off(event: LiveEventType, cb: LiveEventCallback) {
    listeners.get(event)?.delete(cb);
  }

  return {
    connect,
    disconnect,
    on,
    off,
    get isConnected() {
      return connected;
    },
  };
}
