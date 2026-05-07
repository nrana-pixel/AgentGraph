"use client";

import { useState } from "react";
import { formatDuration, formatTimestamp } from "../../lib/dateUtils.js";

interface TraceStep {
  id: string;
  stepIndex: number;
  type: string;
  name: string;
  input: string | null;
  output: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: string | null;
  error: string | null;
  model: string | null;
  toolName: string | null;
  timestamp: string;
}

const TYPE_ICONS: Record<string, string> = {
  llm_call: "🤖",
  tool_call: "🔧",
  retrieval: "📚",
  human: "👤",
  custom: "⚙️",
};

const TYPE_COLORS: Record<string, string> = {
  llm_call: "bg-blue-500",
  tool_call: "bg-violet-500",
  retrieval: "bg-amber-500",
  human: "bg-emerald-500",
  custom: "bg-slate-500",
};

export function WaterfallTimeline({
  steps,
  totalLatencyMs,
}: {
  steps: TraceStep[];
  totalLatencyMs: number | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const maxLatency = totalLatencyMs ?? Math.max(...steps.map((s) => s.latencyMs ?? 0), 1);

  return (
    <div className="space-y-1">
      {/* Header */}
      <div className="mb-2 grid grid-cols-[2rem_1fr_10rem_6rem_6rem_5rem] gap-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <span>#</span>
        <span>Step</span>
        <span>Duration bar</span>
        <span className="text-right">Latency</span>
        <span className="text-right">Tokens</span>
        <span className="text-right">Cost</span>
      </div>

      {steps.map((step) => {
        const isExpanded = expanded === step.id;
        const widthPct =
          maxLatency > 0 && step.latencyMs != null
            ? Math.max(2, (step.latencyMs / maxLatency) * 100)
            : 2;
        const barColor = TYPE_COLORS[step.type] ?? "bg-slate-500";
        const isError = !!step.error;

        return (
          <div key={step.id}>
            <button
              className={`w-full rounded-md border px-2 py-2 text-left transition-colors hover:bg-muted/20 ${
                isError
                  ? "border-red-500/30 bg-red-500/5"
                  : "border-border bg-card"
              } ${isExpanded ? "border-primary/40" : ""}`}
              onClick={() => setExpanded(isExpanded ? null : step.id)}
            >
              <div className="grid grid-cols-[2rem_1fr_10rem_6rem_6rem_5rem] items-center gap-2">
                {/* Index */}
                <span className="text-xs text-muted-foreground">
                  {step.stepIndex + 1}
                </span>

                {/* Type icon + name */}
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="shrink-0 text-sm">
                    {TYPE_ICONS[step.type] ?? "•"}
                  </span>
                  <span className="truncate text-sm font-medium">{step.name}</span>
                  {step.model && (
                    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-xs text-muted-foreground">
                      {step.model}
                    </span>
                  )}
                  {step.toolName && (
                    <span className="shrink-0 rounded bg-violet-500/15 px-1 py-0.5 text-xs text-violet-400">
                      {step.toolName}
                    </span>
                  )}
                  {isError && (
                    <span className="shrink-0 rounded bg-red-500/15 px-1 py-0.5 text-xs text-red-400">
                      error
                    </span>
                  )}
                </div>

                {/* Duration bar */}
                <div className="h-4 rounded-sm bg-muted/30 overflow-hidden">
                  <div
                    className={`h-full rounded-sm ${barColor} opacity-70`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>

                {/* Latency */}
                <span className="text-right text-xs text-muted-foreground">
                  {step.latencyMs != null ? formatDuration(step.latencyMs) : "—"}
                </span>

                {/* Tokens */}
                <span className="text-right text-xs text-muted-foreground">
                  {step.totalTokens != null ? step.totalTokens.toLocaleString() : "—"}
                </span>

                {/* Cost */}
                <span className="text-right text-xs text-muted-foreground">
                  {step.costUsd != null
                    ? `$${parseFloat(step.costUsd).toFixed(5)}`
                    : "—"}
                </span>
              </div>
            </button>

            {/* Expanded payload viewer */}
            {isExpanded && (
              <div className="mx-2 rounded-b-md border border-t-0 border-border bg-muted/10 p-3 space-y-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>
                    Type: <span className="text-foreground">{step.type}</span>
                  </span>
                  <span>
                    At:{" "}
                    <span className="text-foreground">
                      {formatTimestamp(new Date(step.timestamp))}
                    </span>
                  </span>
                  {step.promptTokens != null && (
                    <span>
                      Prompt: <span className="text-foreground">{step.promptTokens}</span> /{" "}
                      Completion:{" "}
                      <span className="text-foreground">{step.completionTokens}</span>
                    </span>
                  )}
                </div>

                {step.error && (
                  <div className="rounded-md bg-red-500/10 p-2">
                    <p className="text-xs font-medium text-red-400">Error</p>
                    <pre className="mt-1 whitespace-pre-wrap text-xs text-red-300">
                      {step.error}
                    </pre>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {step.input && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Input</p>
                      <JsonViewer value={step.input} />
                    </div>
                  )}
                  {step.output && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">Output</p>
                      <JsonViewer value={step.output} />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JsonViewer({ value }: { value: string }) {
  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    formatted = value;
  }

  return (
    <pre className="max-h-48 overflow-y-auto rounded-md bg-muted p-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
      {formatted}
    </pre>
  );
}
