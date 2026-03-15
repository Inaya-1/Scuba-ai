import { AgentResponse, Priority } from "../types";

function mapPriority(p: number): Priority {
  if (p >= 8) return "critical";
  if (p >= 5) return "high";
  if (p >= 3) return "medium";
  return "low";
}

function parseResponse(data: any): AgentResponse {
  return {
    agent: data.agent ?? "manager",
    type: data.type ?? "info",
    content: data.content ?? "",
    priority: typeof data.priority === "number" ? mapPriority(data.priority) : data.priority ?? "low",
    metadata: data.metadata,
  };
}

type ConnectionCallbacks = {
  onResponse: (res: AgentResponse) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onError: (err: Event) => void;
};

export class ScubaSocket {
  private ws: WebSocket | null = null;
  private callbacks: ConnectionCallbacks | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _shouldReconnect = false;
  private _reconnectDelay = 1000;
  private _reconnectAttempt = 0;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect(callbacks: ConnectionCallbacks) {
    this.callbacks = callbacks;
    this._shouldReconnect = true;
    this._reconnectDelay = 1000;
    this._reconnectAttempt = 0;
    this._connect();
  }

  private _connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws`;

    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WS] Connected to backend");
      this._reconnectDelay = 1000;
      this._reconnectAttempt = 0;
      this.callbacks?.onConnect();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.warn("[WS] Backend error:", data.error);
          return;
        }
        this.callbacks?.onResponse(parseResponse(data));
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      this.callbacks?.onDisconnect();
      if (this._shouldReconnect) {
        this._reconnectAttempt++;
        console.log(`[WS] Reconnecting in ${this._reconnectDelay}ms (attempt ${this._reconnectAttempt})`);
        this.reconnectTimer = setTimeout(() => this._connect(), this._reconnectDelay);
        this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
      }
    };

    ws.onerror = (err) => {
      console.error("[WS] Error:", err);
      this.callbacks?.onError(err);
      ws.close();
    };

    this.ws = ws;
  }

  /** Send a camera frame for multi-agent analysis (safety + bio + nav) */
  sendFrame(base64: string, heading?: number, accel?: number) {
    if (!this.connected) return;
    this.ws!.send(JSON.stringify({
      type: "frame",
      payload: base64,
      metadata: { timestamp: Date.now(), heading, accel },
    }));
  }

  /** Upload a dive site map for navigation analysis */
  sendMap(base64: string) {
    if (!this.connected) return;
    this.ws!.send(JSON.stringify({
      type: "map_upload",
      payload: base64,
      metadata: { timestamp: Date.now() },
    }));
  }

  /** User-triggered species identification ("What is this?") */
  sendIdentify(base64: string, prompt?: string) {
    if (!this.connected) return;
    this.ws!.send(JSON.stringify({
      type: "identify",
      payload: base64,
      metadata: { timestamp: Date.now(), prompt: prompt ?? "" },
    }));
  }

  /** Explicit gauge reading request (photo of SPG held to camera) */
  sendGaugeRead(base64: string) {
    if (!this.connected) return;
    this.ws!.send(JSON.stringify({
      type: "gauge_read",
      payload: base64,
      metadata: { timestamp: Date.now() },
    }));
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}

export const scubaSocket = new ScubaSocket();
