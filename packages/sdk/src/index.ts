import { sendIngest, type AgentGraphConfig } from "./client.js";
import { Trace, type TraceOptions } from "./trace.js";

export { Span } from "./span.js";
export { Trace, type TraceOptions } from "./trace.js";
export type { AgentGraphConfig } from "./client.js";

export class AgentGraph {
  private config: AgentGraphConfig;

  constructor(config: AgentGraphConfig) {
    this.config = config;
  }

  trace(options: TraceOptions): Trace {
    return new Trace(options, (payload) =>
      sendIngest(this.config, payload).then(() => undefined)
    );
  }
}
