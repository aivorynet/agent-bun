import { hostname } from "os";
import { randomUUID } from "crypto";

export interface ConfigOptions {
  apiKey?: string;
  backendUrl?: string;
  environment?: string;
  samplingRate?: number;
  maxCaptureDepth?: number;
  maxStringLength?: number;
  maxCollectionSize?: number;
  debug?: boolean;
}

export class AgentConfig {
  readonly apiKey: string;
  readonly backendUrl: string;
  readonly environment: string;
  readonly samplingRate: number;
  readonly maxCaptureDepth: number;
  readonly maxStringLength: number;
  readonly maxCollectionSize: number;
  readonly debug: boolean;
  readonly hostname: string;
  readonly agentId: string;

  private customContext: Record<string, unknown> = {};
  private user: { id?: string; email?: string; username?: string } = {};

  constructor(options: ConfigOptions = {}) {
    this.apiKey = options.apiKey || Bun.env.AIVORY_API_KEY || '';
    this.backendUrl = options.backendUrl || Bun.env.AIVORY_BACKEND_URL || 'wss://api.aivory.net/ws/agent';
    this.environment = options.environment || Bun.env.AIVORY_ENVIRONMENT || 'production';
    this.samplingRate = options.samplingRate ?? parseFloat(Bun.env.AIVORY_SAMPLING_RATE || '1.0');
    this.maxCaptureDepth = options.maxCaptureDepth ?? parseInt(Bun.env.AIVORY_MAX_DEPTH || '10', 10);
    this.maxStringLength = options.maxStringLength ?? parseInt(Bun.env.AIVORY_MAX_STRING_LENGTH || '1000', 10);
    this.maxCollectionSize = options.maxCollectionSize ?? parseInt(Bun.env.AIVORY_MAX_COLLECTION_SIZE || '100', 10);
    this.debug = options.debug ?? (Bun.env.AIVORY_DEBUG === 'true');

    this.hostname = hostname();
    this.agentId = `agent-${Date.now().toString(16)}-${randomUUID().slice(0, 8)}`;

    if (this.debug) {
      console.log(`[AIVory Monitor] Backend URL: ${this.backendUrl}`);
    }
  }

  shouldSample(): boolean {
    if (this.samplingRate >= 1.0) return true;
    if (this.samplingRate <= 0.0) return false;
    return Math.random() < this.samplingRate;
  }

  setCustomContext(context: Record<string, unknown>): void {
    this.customContext = { ...context };
  }

  getCustomContext(): Record<string, unknown> {
    return { ...this.customContext };
  }

  setUser(user: { id?: string; email?: string; username?: string }): void {
    this.user = { ...user };
  }

  getUser(): { id?: string; email?: string; username?: string } {
    return { ...this.user };
  }

  getRuntimeInfo(): Record<string, string> {
    return {
      runtime: 'bun',
      runtimeVersion: Bun.version,
      platform: process.platform,
      arch: process.arch
    };
  }
}
