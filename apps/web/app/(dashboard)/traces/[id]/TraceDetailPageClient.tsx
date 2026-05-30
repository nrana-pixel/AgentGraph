"use client";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fmtMs, fmtNum, fmtMoney, relTime } from "@/lib/format";
import { Badge, StatusBadge, EnvBadge, JsonView } from "@/components/ui/primitives";
import { IconCopy, IconExt, IconSearch } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { useProject } from "@/hooks/useProject";
import { apiGet } from "@/lib/api";
import type { TraceRow, TraceStepRow } from "@agentgraph/types";

type VizStyle = "bars" | "flame" | "timeline";

function BarsViz({
  steps,
  totalLat,
  active,
  setActive,
}: {
  steps: TraceStepRow[];
  totalLat: number;
  active: number;
  setActive: (i: number) => void;
}) {
  let cursor = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {steps.map((s, i) => {
        const start = cursor;
        const end = cursor + (s.latencyMs || 0);
        cursor = end;
        const left = (start / totalLat) * 100;
        const width = Math.max(0.4, ((s.latencyMs || 0) / totalLat) * 100);
        return (
          <div
            key={s.id}
            className="wf-row"
            data-active={active === i ? "true" : undefined}
            onClick={() => setActive(i)}
          >
            <div className="wf-idx">{String(i + 1).padStart(2, "0")}</div>
            <div className="wf-name">
              <Badge
                tone={
                  s.error
                    ? "err"
                    : s.type === "llm_call"
                      ? "violet"
                      : s.type === "retrieval"
                        ? "info"
                        : "warn"
                }
              >
                {s.type.replace("_", " ")}
              </Badge>
              <b>{s.name}</b>
            </div>
            <div className="wf-bar-track">
              <div
                className="wf-bar"
                data-type={s.type}
                data-error={s.error ? "true" : "false"}
                style={{ left: left + "%", width: width + "%" }}
              />
            </div>
            <div className="wf-lat">{fmtMs(s.latencyMs ?? undefined)}</div>
          </div>
        );
      })}
    </div>
  );
}

function FlameViz({
  steps,
  totalLat,
  active,
  setActive,
}: {
  steps: TraceStepRow[];
  totalLat: number;
  active: number;
  setActive: (i: number) => void;
}) {
  let cursor = 0;
  const lanes = ["llm_call", "tool_call", "retrieval", "human", "custom"];
  const colorOf = (t: string, err: string | null) =>
    err
      ? "var(--error)"
      : t === "llm_call"
        ? "var(--violet)"
        : t === "tool_call"
          ? "var(--accent)"
          : t === "retrieval"
            ? "var(--info)"
            : "var(--success)";
  const positions = steps.map((s) => {
    const start = cursor;
    cursor += s.latencyMs || 0;
    return { start, end: cursor, lane: lanes.indexOf(s.type), step: s };
  });
  return (
    <div style={{ position: "relative", padding: "8px 0" }}>
      <div style={{ position: "relative", height: lanes.length * 24 + 24 }}>
        {lanes.map((l, i) => (
          <div
            key={l}
            style={{
              position: "absolute",
              top: i * 24 + 2,
              left: 0,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-3)",
              width: 60,
            }}
          >
            {l}
          </div>
        ))}
        <div style={{ position: "absolute", left: 70, right: 0, top: 0, bottom: 24 }}>
          {[0, 0.25, 0.5, 0.75, 1].map((p) => (
            <div
              key={p}
              style={{
                position: "absolute",
                left: p * 100 + "%",
                top: 0,
                bottom: 0,
                width: 1,
                background: "var(--grid-line)",
              }}
            />
          ))}
          {positions.map((p, i) => {
            const left = (p.start / totalLat) * 100;
            const width = Math.max(0.6, ((p.end - p.start) / totalLat) * 100);
            return (
              <div
                key={i}
                className="flame-block"
                onClick={() => setActive(i)}
                data-active={active === i ? "true" : undefined}
                style={{
                  left: left + "%",
                  width: "calc(" + width + "% - 2px)",
                  top: p.lane * 24 + 1,
                  height: 22,
                  background: colorOf(p.step.type, p.step.error),
                  outline: active === i ? "1.5px solid var(--text)" : "none",
                  opacity: active != null && active !== i ? 0.55 : 1,
                }}
                title={p.step.name}
              >
                {width > 6 ? p.step.name : ""}
              </div>
            );
          })}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 22,
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--text-3)",
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((p) => (
              <span
                key={p}
                style={{ position: "absolute", left: p * 100 + "%", transform: "translateX(-50%)" }}
              >
                {fmtMs(Math.round(totalLat * p))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineViz({
  steps,
  active,
  setActive,
}: {
  steps: TraceStepRow[];
  active: number;
  setActive: (i: number) => void;
}) {
  let cursor = 0;
  return (
    <div style={{ position: "relative", padding: "8px 8px 8px 80px" }}>
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 12,
          bottom: 12,
          width: 1,
          background: "var(--border-2)",
        }}
      />
      {steps.map((s, i) => {
        const startMs = cursor;
        cursor += s.latencyMs || 0;
        const isActive = active === i;
        return (
          <div
            key={s.id}
            onClick={() => setActive(i)}
            style={{
              position: "relative",
              padding: "10px 12px",
              marginBottom: 6,
              borderRadius: 7,
              background: isActive ? "var(--accent-soft)" : "transparent",
              cursor: "default",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: -34,
                top: 14,
                fontFamily: "var(--font-mono)",
                fontSize: 10.5,
                color: "var(--text-3)",
                width: 48,
                textAlign: "right",
              }}
            >
              +{fmtMs(startMs)}
            </div>
            <div
              style={{
                position: "absolute",
                left: -16,
                top: 14,
                width: 9,
                height: 9,
                borderRadius: 50,
                background: s.error
                  ? "var(--error)"
                  : s.type === "llm_call"
                    ? "var(--violet)"
                    : s.type === "tool_call"
                      ? "var(--accent)"
                      : "var(--info)",
                border: "2px solid var(--bg)",
                boxShadow: isActive ? "0 0 0 3px var(--accent-soft)" : "none",
              }}
            />
            <div className="row" style={{ gap: 10, marginBottom: 4 }}>
              <Badge tone={s.error ? "err" : s.type === "llm_call" ? "violet" : "warn"}>
                {s.type.replace("_", " ")}
              </Badge>
              <b className="mono" style={{ fontSize: 12.5 }}>
                {s.name}
              </b>
              <div className="spacer" />
              <span className="mono muted" style={{ fontSize: 11 }}>
                {fmtMs(s.latencyMs ?? undefined)}
              </span>
            </div>
            <div
              className="row"
              style={{
                gap: 12,
                fontSize: 11,
                color: "var(--text-2)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {s.model && <span>{s.model}</span>}
              {s.toolName && <span>{s.toolName}</span>}
              {s.totalTokens != null && <span>{s.totalTokens} tok</span>}
              {s.costUsd && <span>{fmtMoney(s.costUsd)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TraceDetailPageClient({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { project, token, loading: projectLoading } = useProject();
  const [data, setData] = useState<{ trace: TraceRow; steps: TraceStepRow[] } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [activeStep, setActiveStep] = useState(0);
  const [viz, setViz] = useState<VizStyle>("bars");
  const [stepFilter, setStepFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    if (!project || !token) return;
    setFetching(true);
    setNotFound(false);
    apiGet<{ trace: TraceRow; steps: TraceStepRow[] }>(
      `/v1/traces/${id}?projectId=${project.id}`,
      token,
    )
      .then((d) => setData(d))
      .catch(() => setNotFound(true))
      .finally(() => setFetching(false));
  }, [id, project, token]);

  const trace = data?.trace ?? null;
  const steps = data?.steps ?? [];
  const totalLat = steps.reduce((a, s) => a + (s.latencyMs || 0), 0);
  const meta = (() => {
    try {
      return JSON.parse(trace?.metadata ?? "{}");
    } catch {
      return {};
    }
  })();

  const filteredSteps = useMemo(
    () =>
      steps.filter((s) => {
        if (typeFilter && s.type !== typeFilter) return false;
        if (errorsOnly && !s.error) return false;
        if (
          stepFilter &&
          !(s.name + " " + (s.toolName ?? "") + " " + (s.model ?? ""))
            .toLowerCase()
            .includes(stepFilter.toLowerCase())
        )
          return false;
        return true;
      }),
    [steps, typeFilter, errorsOnly, stepFilter],
  );

  const active = steps[activeStep] ?? steps[0];

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      if (e.key === "j") {
        e.preventDefault();
        setActiveStep((i) => Math.min(steps.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setActiveStep((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [steps.length]);

  if (projectLoading || fetching) {
    return (
      <div className="fade-up">
        <div className="page-h">
          <div>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push("/traces")}>
              ← Traces
            </button>
          </div>
        </div>
        <div className="card card-pad muted" style={{ textAlign: "center" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (notFound || !trace) {
    return (
      <div className="fade-up">
        <div className="page-h">
          <h1>Trace not found</h1>
        </div>
        <div className="card card-pad muted">
          No trace with id <code className="mono">{id}</code>.{" "}
          <button
            className="btn btn-sm"
            onClick={() => router.push("/traces")}
            style={{ marginLeft: 8 }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const copyId = () => {
    navigator.clipboard?.writeText?.(trace.id);
    toast("Trace ID copied");
  };
  const copyAsCurl = (s: TraceStepRow) => {
    const body = s.input ?? "{}";
    const curl = `curl -X POST https://api.${s.toolName ?? "tool"}.com/v1/${s.name} \\\n  -H "Authorization: Bearer $TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
    navigator.clipboard?.writeText?.(curl);
    toast("cURL copied to clipboard");
  };

  return (
    <div className="fade-up">
      <div className="page-h">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => router.push("/traces")}>
              ← Traces
            </button>
            <span className="mono muted-2" style={{ fontSize: 11 }}>
              {trace.id}
            </span>
          </div>
          <h1 className="mono" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
            {trace.agentId}
          </h1>
          <div className="sub row" style={{ gap: 10, marginTop: 6 }}>
            <StatusBadge status={trace.status} />
            <EnvBadge env={trace.env} />
            <span className="muted">·</span>
            <span className="muted mono">{relTime(trace.startedAt)}</span>
            <span className="muted">·</span>
            <span className="muted mono">{steps.length} steps</span>
          </div>
        </div>
        <div className="row">
          <button className="btn" onClick={copyId}>
            <IconCopy /> Copy ID
          </button>
          <button className="btn">
            <IconExt /> Open in Notebook
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "var(--gap-card, 14px)",
          marginBottom: 14,
        }}
      >
        <div className="card stat">
          <div className="stat-label">Latency</div>
          <div className="stat-value">{fmtMs(trace.totalLatencyMs ?? undefined)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Tokens</div>
          <div className="stat-value">{fmtNum(trace.totalTokens ?? undefined)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Cost</div>
          <div className="stat-value">{fmtMoney(trace.totalCostUsd ?? undefined)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Steps</div>
          <div className="stat-value">{steps.length}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Errors</div>
          <div
            className="stat-value"
            style={{ color: steps.some((s) => s.error) ? "var(--error)" : "var(--text)" }}
          >
            {steps.filter((s) => s.error).length}
          </div>
        </div>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "var(--gap-card, 14px)" }}
      >
        <div className="card">
          <div className="hd">
            <h3>Execution</h3>
            <span className="sub mono">
              {fmtMs(totalLat)} total · {filteredSteps.length}/{steps.length}
            </span>
            <div className="spacer" />
            <div className="seg">
              <button
                data-active={viz === "bars" ? "true" : "false"}
                onClick={() => setViz("bars")}
              >
                Bars
              </button>
              <button
                data-active={viz === "flame" ? "true" : "false"}
                onClick={() => setViz("flame")}
              >
                Flame
              </button>
              <button
                data-active={viz === "timeline" ? "true" : "false"}
                onClick={() => setViz("timeline")}
              >
                Timeline
              </button>
            </div>
          </div>
          <div
            style={{
              padding: "10px 14px 4px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div className="kbar" style={{ minWidth: 200, flex: "0 1 240px" }}>
              <IconSearch />
              <input
                placeholder="Filter steps by name, tool, model…"
                value={stepFilter}
                onChange={(e) => setStepFilter(e.target.value)}
              />
            </div>
            <div className="seg">
              {["", "llm_call", "tool_call", "retrieval"].map((s) => (
                <button
                  key={s || "all"}
                  data-active={typeFilter === s ? "true" : "false"}
                  onClick={() => setTypeFilter(s)}
                >
                  {s ? s.replace("_", " ") : "all"}
                </button>
              ))}
            </div>
            <label className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
              <input
                type="checkbox"
                checked={errorsOnly}
                onChange={(e) => setErrorsOnly(e.target.checked)}
              />
              Errors only
            </label>
            <div className="spacer" />
            <span className="mono muted-2" style={{ fontSize: 10.5 }}>
              j/k to navigate steps
            </span>
          </div>
          <div style={{ padding: 12 }}>
            {filteredSteps.length === 0 ? (
              <div style={{ padding: "32px 16px", textAlign: "center" }} className="muted">
                No steps match the filter.
              </div>
            ) : (
              <>
                {viz === "bars" && (
                  <BarsViz
                    steps={filteredSteps}
                    totalLat={totalLat}
                    active={active ? filteredSteps.indexOf(active) : -1}
                    setActive={(i) => {
                      const s = filteredSteps[i];
                      if (s) setActiveStep(steps.indexOf(s));
                    }}
                  />
                )}
                {viz === "flame" && (
                  <FlameViz
                    steps={filteredSteps}
                    totalLat={totalLat}
                    active={active ? filteredSteps.indexOf(active) : -1}
                    setActive={(i) => {
                      const s = filteredSteps[i];
                      if (s) setActiveStep(steps.indexOf(s));
                    }}
                  />
                )}
                {viz === "timeline" && (
                  <TimelineViz
                    steps={filteredSteps}
                    active={active ? filteredSteps.indexOf(active) : -1}
                    setActive={(i) => {
                      const s = filteredSteps[i];
                      if (s) setActiveStep(steps.indexOf(s));
                    }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div className="col" style={{ gap: "var(--gap-card, 14px)" }}>
          <div className="card">
            <div className="hd">
              <h3>Metadata</h3>
            </div>
            <div
              style={{
                padding: "10px 16px 16px",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "8px 14px",
                fontSize: 12,
              }}
            >
              <span className="muted-2">session</span>
              <span className="mono">{trace.sessionId ?? "—"}</span>
              <span className="muted-2">user</span>
              <span className="mono">{trace.userId ?? "—"}</span>
              <span className="muted-2">source</span>
              <span className="mono">{(meta as Record<string, string>).source ?? "—"}</span>
              <span className="muted-2">version</span>
              <span className="mono">{(meta as Record<string, string>).version ?? "—"}</span>
              <span className="muted-2">started</span>
              <span className="mono">{new Date(trace.startedAt).toLocaleTimeString()}</span>
              <span className="muted-2">ended</span>
              <span className="mono">
                {trace.endedAt ? new Date(trace.endedAt).toLocaleTimeString() : "—"}
              </span>
            </div>
          </div>

          {active && (
            <div className="card fade-up" key={active.id}>
              <div className="hd">
                <Badge
                  tone={
                    active.error
                      ? "err"
                      : active.type === "llm_call"
                        ? "violet"
                        : active.type === "retrieval"
                          ? "info"
                          : "warn"
                  }
                >
                  {active.type}
                </Badge>
                <h3 className="mono" style={{ fontSize: 13 }}>
                  {active.name}
                </h3>
                <div className="spacer" />
                <span className="sub mono">
                  step {active.stepIndex + 1}/{steps.length}
                </span>
                {active.type === "tool_call" && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => copyAsCurl(active)}
                    title="Copy as cURL"
                  >
                    <IconCopy /> cURL
                  </button>
                )}
              </div>
              <div
                style={{
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "6px 12px",
                  fontSize: 11.5,
                }}
              >
                <span className="muted-2">latency</span>
                <span className="mono">{fmtMs(active.latencyMs ?? undefined)}</span>
                {active.model && (
                  <>
                    <span className="muted-2">model</span>
                    <span className="mono">{active.model}</span>
                  </>
                )}
                {active.toolName && (
                  <>
                    <span className="muted-2">tool</span>
                    <span className="mono">
                      {active.toolName} <span className="muted-2">v{active.toolVersion}</span>
                    </span>
                  </>
                )}
                {active.totalTokens != null && (
                  <>
                    <span className="muted-2">tokens</span>
                    <span className="mono">
                      {active.promptTokens} → {active.completionTokens} ({active.totalTokens})
                    </span>
                  </>
                )}
                {active.costUsd && (
                  <>
                    <span className="muted-2">cost</span>
                    <span className="mono">{fmtMoney(active.costUsd)}</span>
                  </>
                )}
              </div>
              <div
                style={{
                  padding: "0 16px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div>
                  <div className="mono muted-2" style={{ fontSize: 10.5, padding: "4px 0" }}>
                    INPUT
                  </div>
                  <JsonView value={active.input} max={140} />
                </div>
                <div>
                  <div className="mono muted-2" style={{ fontSize: 10.5, padding: "4px 0" }}>
                    OUTPUT
                  </div>
                  <JsonView value={active.output} max={140} />
                </div>
                {active.error && (
                  <div
                    style={{
                      padding: 10,
                      border: "1px solid color-mix(in srgb, var(--error) 38%, transparent)",
                      borderRadius: 7,
                      background: "var(--error-soft)",
                      color: "var(--error)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11.5,
                    }}
                  >
                    {active.error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
