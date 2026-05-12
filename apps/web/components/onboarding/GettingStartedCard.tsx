"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

export function GettingStartedCard() {
  const [key, setKey] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const stashed = sessionStorage.getItem("ag_onboarding_key");
    if (stashed) {
      setKey(stashed);
      setFresh(true);
      sessionStorage.removeItem("ag_onboarding_key");
    }
  }, []);

  const displayKey = key ?? "ag_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  const snippet = `import { AgentGraph } from "@agentgraph/sdk";

const ag = new AgentGraph({ apiKey: "${displayKey}" });

const trace = ag.trace({ agentId: "my-agent", sessionId: "s1", userId: "u1" });
await trace.step("tool_call", "web_search", async (span) => {
  span.setInput({ query: "hello world" });
  span.setOutput({ ok: true });
});
await trace.flush();`;

  const copy = (text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast(`Copied ${what}`),
      () => toast(`Copy failed`),
    );
  };

  return (
    <div className="card card-pad fade-up" style={{ marginBottom: 14 }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 4 }}>Send your first trace</h2>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            {fresh
              ? "We created a starter API key for you. Copy it now — it won't be shown again."
              : "Install the SDK and emit a trace. Your live data will replace this card."}
          </div>

          <div className="col" style={{ gap: 10 }}>
            <div>
              <div className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>1. Install</div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <code className="mono" style={{ flex: 1, padding: "8px 12px", background: "var(--panel-hi)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12 }}>
                  npm install @agentgraph/sdk
                </code>
                <button className="btn btn-sm" onClick={() => copy("npm install @agentgraph/sdk", "install command")}>Copy</button>
              </div>
            </div>

            <div>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                <span className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase" }}>2. Your API key</span>
                {!fresh && <Link href="/settings" className="mono" style={{ fontSize: 11 }}>Create one in Settings →</Link>}
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <code className="mono" style={{ flex: 1, padding: "8px 12px", background: "var(--panel-hi)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, color: fresh ? "var(--accent)" : "var(--text-3)" }}>
                  {displayKey}
                </code>
                {fresh && <button className="btn btn-sm btn-primary" onClick={() => copy(displayKey, "API key")}>Copy</button>}
              </div>
            </div>

            <div>
              <div className="mono muted-2" style={{ fontSize: 10.5, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>3. Emit a trace</div>
              <div style={{ position: "relative" }}>
                <pre className="mono" style={{ margin: 0, padding: "12px 14px", background: "var(--panel-hi)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 11.5, overflow: "auto", whiteSpace: "pre" }}>
{snippet}
                </pre>
                <button
                  className="btn btn-sm"
                  style={{ position: "absolute", top: 8, right: 8 }}
                  onClick={() => copy(snippet, "snippet")}
                >
                  Copy
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
