import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import {
  SpanKind,
  SpanStatusCode,
  type HrTime,
  type SpanContext,
  TraceFlags,
} from "@opentelemetry/api";
import type { Project, Trace, TraceStep } from "../db/schema.js";

// ---------------------------------------------------------------------------
// OTLP trace export
//
// After a trace is persisted, the worker can (out-of-band, never blocking
// ingest) replay its steps as OpenTelemetry spans to a per-project OTLP/HTTP
// endpoint, so customers can pipe traces into Datadog / Honeycomb / their own
// collector. We never run an in-process tracer here — instead we construct
// ReadableSpan-shaped objects directly and hand them to the exporter. That
// lets us reuse our own trace/step ids as the OTel trace/span ids (a live
// tracer auto-generates ids and won't let us replay historical data).
// ---------------------------------------------------------------------------

const SERVICE_NAME = "agentgraph";

/** Plain, JSON-serialisable description of a single OTel span. The pure
 *  mapping (`stepToSpanData`) produces this; `toReadableSpan` later inflates
 *  it into the SDK's ReadableSpan shape. Kept separate so the mapping logic is
 *  unit-testable without pulling in a live exporter. */
export interface OtlpSpanData {
  traceId: string; // 32 hex chars
  spanId: string; // 16 hex chars
  parentSpanId?: string; // 16 hex chars, when the step has a parent
  name: string;
  startTimeUnixMs: number;
  endTimeUnixMs: number;
  attributes: Record<string, string | number | boolean>;
  status: { code: SpanStatusCode; message?: string };
}

/** UUID (with or without dashes) → 32 hex char OTel trace id. */
function uuidToTraceId(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase().padEnd(32, "0").slice(0, 32);
}

/** UUID (with or without dashes) → 16 hex char OTel span id. We truncate the
 *  dashless uuid deterministically so the same step id always maps to the same
 *  span id (and a child's parentStepId resolves to its parent's span id). */
function uuidToSpanId(uuid: string): string {
  return uuid.replace(/-/g, "").toLowerCase().padEnd(16, "0").slice(0, 16);
}

/**
 * Pure mapping: a persisted trace step → the data for one OTel span.
 *
 * Uses GenAI semantic conventions for model/token attributes and
 * `agentgraph.*` for our own fields. Status is ERROR when the step recorded an
 * error, OK otherwise. Timing comes from `timestamp` (start) and
 * `timestamp + latencyMs` (end). Exported (and unit-tested) in isolation.
 */
export function stepToSpanData(traceId: string, step: TraceStep): OtlpSpanData {
  const startMs = (step.timestamp ?? new Date()).getTime();
  const endMs = startMs + (step.latencyMs ?? 0);

  const attributes: Record<string, string | number | boolean> = {
    "agentgraph.step.type": step.type,
  };

  if (step.model) attributes["gen_ai.request.model"] = step.model;
  if (step.promptTokens != null)
    attributes["gen_ai.usage.input_tokens"] = step.promptTokens;
  if (step.completionTokens != null)
    attributes["gen_ai.usage.output_tokens"] = step.completionTokens;
  if (step.totalTokens != null)
    attributes["gen_ai.usage.total_tokens"] = step.totalTokens;
  if (step.costUsd != null) attributes["agentgraph.cost_usd"] = Number(step.costUsd);
  if (step.toolName) attributes["agentgraph.tool.name"] = step.toolName;
  if (step.toolVersion) attributes["agentgraph.tool.version"] = step.toolVersion;

  const status = step.error
    ? { code: SpanStatusCode.ERROR, message: step.error }
    : { code: SpanStatusCode.OK };

  const data: OtlpSpanData = {
    traceId: uuidToTraceId(traceId),
    spanId: uuidToSpanId(step.id),
    name: step.name,
    startTimeUnixMs: startMs,
    endTimeUnixMs: endMs,
    attributes,
    status,
  };

  if (step.parentStepId) {
    data.parentSpanId = uuidToSpanId(step.parentStepId);
  }

  return data;
}

function msToHrTime(ms: number): HrTime {
  const seconds = Math.trunc(ms / 1000);
  const nanos = Math.round((ms - seconds * 1000) * 1e6);
  return [seconds, nanos];
}

/** Inflate the plain span data into a ReadableSpan the OTLP exporter accepts. */
function toReadableSpan(data: OtlpSpanData, resource: Resource): ReadableSpan {
  const spanContext: SpanContext = {
    traceId: data.traceId,
    spanId: data.spanId,
    traceFlags: TraceFlags.SAMPLED,
  };
  const startTime = msToHrTime(data.startTimeUnixMs);
  const endTime = msToHrTime(data.endTimeUnixMs);
  const duration = msToHrTime(data.endTimeUnixMs - data.startTimeUnixMs);

  return {
    name: data.name,
    kind: SpanKind.INTERNAL,
    spanContext: () => spanContext,
    // `exactOptionalPropertyTypes` is on, so only set parentSpanId when present.
    ...(data.parentSpanId ? { parentSpanId: data.parentSpanId } : {}),
    startTime,
    endTime,
    status: data.status,
    attributes: data.attributes,
    links: [],
    events: [],
    duration,
    ended: true,
    resource,
    instrumentationLibrary: { name: "@agentgraph/worker" },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  };
}

/** Parse the stored OTLP headers JSON string into a header map. Returns {} for
 *  null/blank, and logs-and-returns {} on malformed JSON (never throws). */
function parseHeaders(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch (err) {
    console.error("[otlp-export] failed to parse otlpHeaders JSON:", err);
  }
  return {};
}

/**
 * Export a persisted trace's steps to the project's configured OTLP endpoint.
 *
 * Fire-and-forget: every failure path is caught and logged so this can never
 * throw into (or block) the ingest loop. No-ops unless OTLP is enabled and an
 * endpoint is configured.
 */
export async function exportTraceToOtlp(
  project: Pick<Project, "otlpEnabled" | "otlpEndpoint" | "otlpHeaders">,
  trace: Pick<Trace, "id">,
  steps: TraceStep[],
): Promise<void> {
  try {
    if (!project.otlpEnabled || !project.otlpEndpoint) return;
    if (steps.length === 0) return;

    const resource = new Resource({ "service.name": SERVICE_NAME });
    const spanData = steps.map((step) => stepToSpanData(trace.id, step));
    const spans = spanData.map((d) => toReadableSpan(d, resource));

    const exporter = new OTLPTraceExporter({
      url: project.otlpEndpoint,
      headers: parseHeaders(project.otlpHeaders),
    });

    await new Promise<void>((resolve) => {
      exporter.export(spans, (result) => {
        if (result.code !== 0) {
          console.error(
            "[otlp-export] export failed for trace",
            trace.id,
            result.error ?? "",
          );
        }
        resolve();
      });
    });

    await exporter.shutdown();
  } catch (err) {
    console.error("[otlp-export] unexpected error exporting trace:", err);
  }
}
