import { AgentConfig } from "../config";

export interface ExceptionPayload {
  id: string;
  exceptionType: string;
  message: string;
  fingerprint: string;
  stackTrace: unknown[];
  localVariables: Record<string, unknown>;
  context: Record<string, unknown>;
  capturedAt: string;
}

/**
 * WebSocket connection to the AIVory backend.
 * Uses Bun's native WebSocket implementation.
 */
export class BackendConnection {
  private config: AgentConfig;
  private ws: WebSocket | null = null;
  private authenticated = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private messageQueue: string[] = [];
  private reconnectTimer: Timer | null = null;
  private heartbeatTimer: Timer | null = null;
  private authFailed = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Connects to the backend WebSocket server.
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.config.backendUrl);

      this.ws.onopen = () => {
        if (this.config.debug) {
          console.log('[AIVory Monitor] WebSocket connected');
        }
        this.reconnectAttempts = 0;
        this.authenticate();
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data as string);
      };

      this.ws.onclose = (event) => {
        if (this.config.debug) {
          console.log(`[AIVory Monitor] WebSocket closed: ${event.code}`);
        }
        this.authenticated = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        if (this.config.debug) {
          console.error('[AIVory Monitor] WebSocket error:', error);
        }
      };
    } catch (error) {
      if (this.config.debug) {
        console.error('[AIVory Monitor] Connection error:', error);
      }
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnects from the backend.
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Agent shutdown');
      this.ws = null;
    }

    this.authenticated = false;

    if (this.config.debug) {
      console.log('[AIVory Monitor] Disconnected');
    }
  }

  /**
   * Sends an exception to the backend.
   */
  sendException(capture: ExceptionPayload): void {
    const message = JSON.stringify({
      type: 'exception',
      payload: {
        id: capture.id,
        exception_type: capture.exceptionType,
        message: capture.message,
        fingerprint: capture.fingerprint,
        stack_trace: capture.stackTrace,
        local_variables: capture.localVariables,
        context: capture.context,
        captured_at: capture.capturedAt,
        agent_id: this.config.agentId,
        environment: this.config.environment,
        runtime: 'bun',
        runtime_info: this.config.getRuntimeInfo()
      },
      timestamp: Date.now()
    });

    this.send(message);
  }

  /**
   * Sends a breakpoint hit to the backend.
   */
  sendBreakpointHit(breakpointId: string, data: Record<string, unknown>): void {
    const message = JSON.stringify({
      type: 'breakpoint_hit',
      payload: {
        breakpoint_id: breakpointId,
        agent_id: this.config.agentId,
        ...data
      },
      timestamp: Date.now()
    });

    this.send(message);
  }

  private authenticate(): void {
    const authMessage = JSON.stringify({
      type: 'register',
      payload: {
        api_key: this.config.apiKey,
        agent_id: this.config.agentId,
        hostname: this.config.hostname,
        runtime: 'bun',
        runtime_version: Bun.version,
        agent_version: '0.1.2',
        environment: this.config.environment
      },
      timestamp: Date.now()
    });

    this.ws?.send(authMessage);
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (this.config.debug) {
        console.log(`[AIVory Monitor] Received: ${message.type}`);
      }

      switch (message.type) {
        case 'registered':
          this.authenticated = true;
          if (this.config.debug) {
            console.log('[AIVory Monitor] Agent registered');
          }
          this.flushQueue();
          this.startHeartbeat();
          break;

        case 'error':
          console.error(`[AIVory Monitor] Backend error: ${message.payload?.message}`);
          if (message.payload?.code === 'auth_error' || message.payload?.code === 'invalid_api_key') {
            this.authFailed = true;
            this.ws?.close(4001, 'Authentication failed');
          }
          break;
      }
    } catch (error) {
      if (this.config.debug) {
        console.error('[AIVory Monitor] Failed to parse message:', error);
      }
    }
  }

  private send(message: string): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.ws.send(message);
      if (this.config.debug) {
        console.log('[AIVory Monitor] Sent message');
      }
    } else {
      // Queue message for later
      if (this.messageQueue.length < 1000) {
        this.messageQueue.push(message);
      }
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(message);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
        this.ws.send(JSON.stringify({
          type: 'heartbeat',
          payload: {
            timestamp: Date.now(),
            agent_id: this.config.agentId
          }
        }));
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.authFailed) {
      if (this.config.debug) {
        console.log('[AIVory Monitor] Auth failed, not reconnecting');
      }
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.config.debug) {
        console.log('[AIVory Monitor] Max reconnect attempts reached');
      }
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 60000);
    this.reconnectAttempts++;

    if (this.config.debug) {
      console.log(`[AIVory Monitor] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
