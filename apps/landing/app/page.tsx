import LandingClient from "@/components/LandingClient";

function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
      <line x1="22.1" y1="22.1" x2="41.9" y2="41.9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="22.1" cy="22.1" r="10" fill="#3B43F5" />
      <circle cx="41.9" cy="41.9" r="10" fill="currentColor" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <>
      <header className="nav">
        <a href="#" className="brand">
          <BrandMark />
          <span>AgentGraph</span>
          <span className="brand-ver mono">v0.4</span>
        </a>
        <nav className="nav-links">
          <a href="#trace">Trace</a>
          <a href="#cost">Cost</a>
          <a href="#swap">Recommend</a>
          <a href="#sdk">SDK</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <a href="#changelog">Changelog</a>
        </nav>
        <div className="nav-cta">
          <button className="theme-toggle" aria-label="Toggle theme" title="Toggle theme">
            <svg className="t-sun" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M2.8 2.8l1.1 1.1M12.1 12.1l1.1 1.1M2.8 13.2l1.1-1.1M12.1 3.9l1.1-1.1" />
            </svg>
            <svg className="t-moon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 9.5A5.5 5.5 0 1 1 6.5 3a4.5 4.5 0 0 0 6.5 6.5z" />
            </svg>
          </button>
          <a className="btn-link" href="#">Sign in</a>
          <a className="btn btn-primary" href="#">Get a key <span className="arr">→</span></a>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="hero">
          <div className="hero-bg" aria-hidden="true">
            <div className="hero-grid"></div>
            <div className="hero-glow"></div>
          </div>
          <div className="hero-inner">
            <h1 className="display">
              Your agents made{" "}
              <span className="hl-num" id="hero-traces" data-count="14302" data-format="num">
                14,302
              </span>{" "}
              tool calls today.
              <br />
              You watched <span className="hl-num">five</span> of them.
            </h1>
            <p className="lede">
              AgentGraph reads every span your agents emit in production — every prompt, every tool argument,
              every dollar — and tells you which tool they should have picked instead.{" "}
              <a href="#sdk" className="link">One line to start.</a>
            </p>
            <div className="hero-ctas">
              <a className="btn btn-primary btn-lg" href="#">Get an API key <span className="arr">→</span></a>
              <a className="btn-link btn-lg" href="#docs">Read the docs →</a>
            </div>
            <div className="status mono">
              <span className="status-dot"></span>
              <span className="status-key">live</span>
              <span className="status-sep">·</span>
              <span>v0.4.2 · span-level OTLP export</span>
              <span className="status-sep">·</span>
              <span><b>38ms</b> p50 ingest</span>
              <span className="status-sep">·</span>
              <span><b>4.2M</b> traces / day</span>
              <span className="status-sep">·</span>
              <a className="link" href="#">self-host preview →</a>
            </div>
          </div>
        </section>

        {/* SHOWCASE */}
        <section className="showcase">
          <div className="window">
            <div className="window-chrome">
              <span className="dot d1"></span>
              <span className="dot d2"></span>
              <span className="dot d3"></span>
              <div className="window-url mono">agentgraph.dev/p/acme/dashboard</div>
              <div className="window-tail mono">checkout-agent · prod · last 14d</div>
            </div>

            <div className="snippet">
              <div className="snippet-head">
                <div>
                  <div className="crumb mono">
                    <span>checkout-agent</span>
                    <span className="sep">/</span>
                    <span className="here">overview</span>
                  </div>
                  <h3 className="app-title">Overview</h3>
                </div>
                <div className="app-actions">
                  <span className="pill"><span className="pulse-dot"></span> Live</span>
                  <span className="seg"><b>24h</b><i>14d</i><i>30d</i></span>
                </div>
              </div>

              <div className="stat-grid reveal">
                <div className="stat-card">
                  <div className="sc-k mono">TRACES</div>
                  <div className="sc-v" data-count="128402" data-format="num">0</div>
                  <div className="sc-d ok mono">▲ 12.4%</div>
                  <svg className="sc-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <path d="M0,22 L10,18 L20,20 L30,12 L40,16 L50,8 L60,14 L70,6 L80,10 L90,4 L100,9" fill="none" stroke="var(--accent)" strokeWidth="1.4" />
                    <path d="M0,22 L10,18 L20,20 L30,12 L40,16 L50,8 L60,14 L70,6 L80,10 L90,4 L100,9 L100,30 L0,30 Z" fill="var(--accent)" opacity="0.14" />
                  </svg>
                </div>
                <div className="stat-card">
                  <div className="sc-k mono">TOKENS</div>
                  <div className="sc-v">
                    <span data-count="41.2" data-format="dec">0</span>M
                  </div>
                  <div className="sc-d mono muted">→ steady</div>
                  <svg className="sc-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <path d="M0,16 L10,14 L20,17 L30,12 L40,14 L50,10 L60,11 L70,8 L80,9 L90,7 L100,8" fill="none" stroke="var(--violet)" strokeWidth="1.4" />
                  </svg>
                </div>
                <div className="stat-card hl">
                  <div className="sc-k mono">
                    SPEND <span className="sc-after">— after rec</span>
                  </div>
                  <div className="sc-v">
                    $<span data-count="8142" data-format="num">0</span>
                    <span className="muted">.07</span>
                  </div>
                  <div className="sc-d ok mono">▼ $812 saved · 14d</div>
                  <svg className="sc-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <path d="M0,6 L10,8 L20,7 L30,12 L40,11 L50,15 L60,14 L70,18 L80,17 L90,21 L100,22" fill="none" stroke="var(--info)" strokeWidth="1.4" />
                  </svg>
                </div>
                <div className="stat-card">
                  <div className="sc-k mono">ERROR RATE</div>
                  <div className="sc-v">
                    <span data-count="0.42" data-format="dec">0</span>
                    <span className="unit">%</span>
                  </div>
                  <div className="sc-d err mono">▲ 0.08 pp</div>
                  <svg className="sc-spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                    <g fill="var(--error)" opacity="0.7">
                      <rect x="2" y="22" width="3" height="6" />
                      <rect x="12" y="20" width="3" height="8" />
                      <rect x="22" y="24" width="3" height="4" />
                      <rect x="32" y="18" width="3" height="10" />
                      <rect x="42" y="22" width="3" height="6" />
                      <rect x="52" y="16" width="3" height="12" />
                      <rect x="62" y="20" width="3" height="8" />
                      <rect x="72" y="14" width="3" height="14" />
                      <rect x="82" y="18" width="3" height="10" />
                      <rect x="92" y="12" width="3" height="16" />
                    </g>
                  </svg>
                </div>
              </div>

              <div className="panel">
                <div className="panel-hd">
                  <h4>Top spend by model</h4>
                  <span className="muted mono tail">last 14 days</span>
                </div>
                <ul className="bar-list reveal">
                  <li><span className="bl-n">gpt-4o</span><div className="bl-bar"><div className="bl-fill" data-w="78" style={{ background: "var(--accent)" }}></div></div><span className="bl-v mono">$3,841</span></li>
                  <li><span className="bl-n">claude-3.5-sonnet</span><div className="bl-bar"><div className="bl-fill" data-w="54" style={{ background: "var(--violet)" }}></div></div><span className="bl-v mono">$2,108</span></li>
                  <li><span className="bl-n">gpt-4o-mini</span><div className="bl-bar"><div className="bl-fill" data-w="32" style={{ background: "var(--info)" }}></div></div><span className="bl-v mono">$1,402</span></li>
                  <li><span className="bl-n">claude-3-haiku</span><div className="bl-bar"><div className="bl-fill" data-w="18" style={{ background: "var(--success)" }}></div></div><span className="bl-v mono">$791</span></li>
                  <li><span className="bl-n">embedding-3-large</span><div className="bl-bar"><div className="bl-fill" data-w="8" style={{ background: "var(--text-3)" }}></div></div><span className="bl-v mono">$324</span></li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* INTEGRATIONS */}
        <section className="integrations">
          <div className="int-inner">
            <div className="int-label mono">WORKS WITH</div>
            <ul className="int-list">
              <li>OpenAI</li><li>Anthropic</li><li>Bedrock</li><li>Mistral</li><li>Groq</li><li>Together</li>
              <li className="int-sep">·</li>
              <li>Datadog</li><li>Honeycomb</li><li>Grafana</li>
              <li className="int-sep">·</li>
              <li>Postgres</li><li>Clickhouse</li><li>S3</li><li>BigQuery</li>
            </ul>
          </div>
        </section>

        {/* SPOT 01 — TRACE */}
        <section className="spot" id="trace">
          <div className="spot-copy">
            <div className="spot-tag mono">01 — TRACE</div>
            <h2>The whole agent, not just the LLM call.</h2>
            <p className="spot-lede">
              Most tracing tools see the model. AgentGraph sees the loop around it — the retrieval, the tool you wired up last
              Tuesday, the validator step that swallows errors. Wrap your agent once. We attach the rest.
            </p>
            <dl className="kv">
              <div><dt>Captured</dt><dd>inputs · outputs · prompts · completions · tool args · results · errors</dd></div>
              <div><dt>Timing</dt><dd>nested span tree with parent / child latency</dd></div>
              <div><dt>Pricing</dt><dd>per call, attributed to agent · session · tenant</dd></div>
              <div><dt>Exports</dt><dd>OTLP → Datadog · Honeycomb · Grafana · file</dd></div>
            </dl>
          </div>

          <div className="spot-vis">
            <div className="annotated-trace">
              <div className="at-head">
                <span className="mono muted">t_4f8a · checkout-agent</span>
                <span className="badge ok mono"><span className="dot"></span> 1.83s · $0.018</span>
              </div>
              <div className="at-axis mono">
                <span>0ms</span><span>500</span><span>1000</span><span>1500</span><span>1830</span>
              </div>
              <ol className="at-list">
                <li>
                  <span className="at-i mono">01</span><span className="at-n">retrieve_context</span>
                  <div className="at-track"><div className="at-bar info" style={{ left: "0%", width: "14%" }}></div></div>
                  <span className="at-l mono">256ms</span>
                </li>
                <li className="pin-row">
                  <span className="at-i mono">02</span><span className="at-n">plan · gpt-4o</span>
                  <div className="at-track"><div className="at-bar violet" style={{ left: "14%", width: "32%" }}></div></div>
                  <span className="at-l mono">594ms</span>
                  <div className="ann">
                    <span className="ann-line"></span>
                    <div className="ann-card mono">
                      <div className="ann-k">prompt · 1,820 tokens · $0.0091</div>
                      <div className="ann-v">model: <b>gpt-4o</b> · temp 0.2</div>
                    </div>
                  </div>
                </li>
                <li className="pin-row">
                  <span className="at-i mono">03</span><span className="at-n">stripe.charge</span>
                  <div className="at-track"><div className="at-bar accent" style={{ left: "46%", width: "18%" }}></div></div>
                  <span className="at-l mono">328ms</span>
                  <div className="ann hot">
                    <span className="ann-line"></span>
                    <div className="ann-card mono">
                      <div className="ann-k">suggested swap · −42ms · −$0.0008</div>
                      <div className="ann-v">try <b>finch.payments</b> (score 0.97)</div>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="at-i mono">04</span><span className="at-n">postmark.send</span>
                  <div className="at-track"><div className="at-bar accent" style={{ left: "64%", width: "8%" }}></div></div>
                  <span className="at-l mono">148ms</span>
                </li>
                <li className="pin-row">
                  <span className="at-i mono">05</span><span className="at-n">verify · claude-3.5-haiku</span>
                  <div className="at-track"><div className="at-bar violet" style={{ left: "72%", width: "22%" }}></div></div>
                  <span className="at-l mono">408ms</span>
                  <div className="ann">
                    <span className="ann-line"></span>
                    <div className="ann-card mono">
                      <div className="ann-k">validator · pass · 408ms</div>
                      <div className="ann-v">14 invariants checked</div>
                    </div>
                  </div>
                </li>
                <li>
                  <span className="at-i mono">06</span><span className="at-n">audit_log.write</span>
                  <div className="at-track"><div className="at-bar success" style={{ left: "94%", width: "4%" }}></div></div>
                  <span className="at-l mono">73ms</span>
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* ANATOMY OF A SPAN */}
        <section className="anatomy">
          <div className="an-head">
            <div className="spot-tag mono">ANATOMY OF A SPAN</div>
            <h2>What one row in the waterfall actually contains.</h2>
          </div>
          <div className="an-inner">
            <div className="an-card">
              <div className="an-row">
                <span className="an-i mono">02</span>
                <span className="an-n">plan · gpt-4o</span>
                <div className="an-track"><div className="an-bar"></div></div>
                <span className="an-l mono">594ms</span>
              </div>

              <svg className="an-pointers" viewBox="0 0 800 360" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 70 50 L 70 110" stroke="var(--border-2)" fill="none" />
                <path d="M 230 50 L 230 90 L 280 90" stroke="var(--border-2)" fill="none" />
                <path d="M 460 50 L 460 90 L 510 90" stroke="var(--border-2)" fill="none" />
                <path d="M 720 50 L 720 110" stroke="var(--border-2)" fill="none" />
                <path d="M 70 50 L 70 180 L 110 180" stroke="var(--border-2)" fill="none" />
                <path d="M 230 50 L 230 220 L 280 220" stroke="var(--border-2)" fill="none" />
                <path d="M 460 50 L 460 220 L 510 220" stroke="var(--border-2)" fill="none" />
                <path d="M 720 50 L 720 280" stroke="var(--border-2)" fill="none" />
              </svg>

              <div className="an-fields">
                <div className="an-f"><dt className="mono">name</dt><dd>&quot;plan&quot;</dd></div>
                <div className="an-f"><dt className="mono">parent_id</dt><dd>span_01_retrieve</dd></div>
                <div className="an-f"><dt className="mono">kind</dt><dd>llm_call</dd></div>
                <div className="an-f"><dt className="mono">status</dt><dd>ok</dd></div>

                <div className="an-f hl"><dt className="mono">model</dt><dd><b>gpt-4o</b> · temperature 0.2</dd></div>
                <div className="an-f hl"><dt className="mono">tokens</dt><dd>1,820 in · 412 out · <b>2,232 total</b></dd></div>
                <div className="an-f hl"><dt className="mono">cost_usd</dt><dd><b>0.0091</b> @ live model rate</dd></div>
                <div className="an-f hl"><dt className="mono">latency</dt><dd><b>594ms</b> · started +256ms</dd></div>

                <div className="an-f"><dt className="mono">prompt</dt><dd>truncated · 6.4 KB stored</dd></div>
                <div className="an-f"><dt className="mono">completion</dt><dd>truncated · 1.2 KB stored</dd></div>
                <div className="an-f"><dt className="mono">attributes</dt><dd>customer · session · agent · env</dd></div>
                <div className="an-f"><dt className="mono">error</dt><dd>null</dd></div>
              </div>
            </div>

            <p className="an-foot mono muted">
              12 fields, captured automatically. <a className="link" href="#sdk">See the SDK spec →</a>
            </p>
          </div>
        </section>

        {/* SPOT 02 — COST */}
        <section className="spot reverse" id="cost">
          <div className="spot-copy">
            <div className="spot-tag mono">02 — COST</div>
            <h2>Read every trace like a Stripe invoice.</h2>
            <p className="spot-lede">
              We price every token at the model&apos;s live rate, sum tool fees, and attribute the total to the agent, session,
              and customer that triggered the run. Your CFO gets a CSV. Your on-call gets a webhook. Your agent gets a budget.
            </p>
            <dl className="kv">
              <div><dt>Models</dt><dd>OpenAI · Anthropic · Mistral · Together · Groq · Bedrock</dd></div>
              <div><dt>Rollups</dt><dd>per agent · session · customer · model · day</dd></div>
              <div><dt>Alerts</dt><dd>webhook on trace ≥ threshold, daily digest, hard cap</dd></div>
              <div><dt>Pipe</dt><dd>S3 · BigQuery · Snowflake · Postgres</dd></div>
            </dl>
          </div>

          <div className="spot-vis">
            <div className="receipt">
              <div className="r-head">
                <div>
                  <div className="r-title mono">TRACE · t_4f8a</div>
                  <div className="r-sub mono muted">checkout-agent · 2026·05·16 11:42:08Z</div>
                </div>
                <div className="r-total-tag mono">PROD</div>
              </div>
              <div className="r-rows">
                <div className="r-row"><span className="r-l">gpt-4o · plan</span><span className="r-m mono">1,820 in · 412 out</span><span className="r-v mono">$0.0091</span></div>
                <div className="r-row"><span className="r-l">claude-3.5-haiku · verify</span><span className="r-m mono">880 in · 96 out</span><span className="r-v mono">$0.0019</span></div>
                <div className="r-row"><span className="r-l">stripe.charge</span><span className="r-m mono">tool · 328ms</span><span className="r-v mono">$0.0040</span></div>
                <div className="r-row"><span className="r-l">postmark.send</span><span className="r-m mono">tool · 148ms</span><span className="r-v mono">$0.0010</span></div>
                <div className="r-row"><span className="r-l">retrieve_context</span><span className="r-m mono">8 docs · 1,200 tk</span><span className="r-v mono">$0.0016</span></div>
                <div className="r-row dim"><span className="r-l">audit_log.write</span><span className="r-m mono">free</span><span className="r-v mono">$0.0000</span></div>
              </div>
              <div className="r-divider"></div>
              <div className="r-foot">
                <div><span className="r-fk mono">SUBTOTAL · TOKENS</span><span className="r-fv mono">$0.0110</span></div>
                <div><span className="r-fk mono">SUBTOTAL · TOOLS</span><span className="r-fv mono">$0.0066</span></div>
                <div className="r-grand"><span className="r-fk mono">TOTAL</span><span className="r-fv mono">$0.0176</span></div>
                <div className="r-attr mono muted">attributed to <b>cust_2840</b> · session <b>s_91ab</b></div>
              </div>
            </div>
          </div>
        </section>

        {/* MANIFESTO */}
        <section className="quote">
          <div className="q-inner">
            <div className="q-mark mono">/</div>
            <blockquote className="q-text">
              If you can&apos;t see the call, you can&apos;t fix the agent. Every other tracing tool stops at the LLM. AgentGraph keeps going.
            </blockquote>
            <div className="q-attr">
              <div className="q-avatar"><BrandMark /></div>
              <div className="q-meta">
                <div className="q-name">Why we&apos;re building this</div>
                <div className="q-role mono muted">private beta · v0.4</div>
              </div>
            </div>
          </div>
        </section>

        {/* SPOT 03 — SWAP */}
        <section className="spot" id="swap">
          <div className="spot-copy">
            <div className="spot-tag mono">03 — RECOMMEND</div>
            <h2>The tool your agent should have used.</h2>
            <p className="spot-lede">
              We score every tool call against alternatives in your registry — schema compatibility first, then latency, cost,
              reliability. When something dominates, we open a PR. You click merge.
            </p>
            <dl className="kv">
              <div><dt>Inputs</dt><dd>14 days of traces · your tool registry · pricing API</dd></div>
              <div><dt>Scores</dt><dd>fit · latency · cost · reliability · region</dd></div>
              <div><dt>Output</dt><dd>side-by-side compare, in-app swap, or GitHub PR</dd></div>
              <div><dt>Guardrails</dt><dd>shadow mode → traffic split → cutover</dd></div>
            </dl>
          </div>

          <div className="spot-vis">
            <div className="swap-card">
              <div className="swap-row">
                <div className="swap-side">
                  <div className="swap-label mono">CURRENT</div>
                  <div className="swap-name">stripe.charge</div>
                  <div className="swap-sub mono muted">v2024-06 · us-east-1</div>
                </div>
                <div className="swap-arrow mono">→</div>
                <div className="swap-side suggest">
                  <div className="swap-label mono">SUGGESTED · 0.97 fit</div>
                  <div className="swap-name">finch.payments</div>
                  <div className="swap-sub mono muted">v3.1 · multi-region</div>
                </div>
              </div>
              <div className="swap-metrics">
                <div className="sm-row">
                  <div className="sm-k mono">P50 LATENCY</div>
                  <div className="sm-v mono">328ms</div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "48%", background: "var(--accent)" }}></div></div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "34%", background: "var(--success)" }}></div></div>
                  <div className="sm-v mono">286ms</div>
                  <div className="sm-d mono ok">−42ms</div>
                </div>
                <div className="sm-row">
                  <div className="sm-k mono">COST / 1K</div>
                  <div className="sm-v mono">$4.20</div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "62%", background: "var(--accent)" }}></div></div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "48%", background: "var(--success)" }}></div></div>
                  <div className="sm-v mono">$3.40</div>
                  <div className="sm-d mono ok">−19%</div>
                </div>
                <div className="sm-row">
                  <div className="sm-k mono">RELIABILITY</div>
                  <div className="sm-v mono">99.92</div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "74%", background: "var(--accent)" }}></div></div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "78%", background: "var(--success)" }}></div></div>
                  <div className="sm-v mono">99.96</div>
                  <div className="sm-d mono ok">+0.04</div>
                </div>
                <div className="sm-row">
                  <div className="sm-k mono">SCHEMA FIT</div>
                  <div className="sm-v mono">—</div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "100%", background: "var(--text-3)" }}></div></div>
                  <div className="sm-bar"><div className="sm-fill" style={{ width: "97%", background: "var(--success)" }}></div></div>
                  <div className="sm-v mono">0.97</div>
                  <div className="sm-d mono ok">drop-in</div>
                </div>
              </div>
              <div className="swap-cta">
                <button className="btn-tx">View 14-day shadow report →</button>
                <button className="btn btn-primary btn-sm">Open PR</button>
              </div>
            </div>
          </div>
        </section>

        {/* SDK */}
        <section className="sdk" id="sdk">
          <div className="sdk-shell">
            <div className="sdk-copy">
              <div className="spot-tag mono">04 — SDK</div>
              <h2>
                One line. Then five.
                <br />
                Then nothing else for a while.
              </h2>
              <p className="spot-lede">
                Bring your own LLM client, your own retrieval, your own tool registry. We watch what you call, not how you
                orchestrate it. TypeScript + Python today; Go next month.
              </p>
              <ul className="sdk-feat">
                <li><span className="ck">✓</span><span>Auto-instruments OpenAI &amp; Anthropic SDKs.</span></li>
                <li><span className="ck">✓</span><span>Captures inputs, outputs, tool args &amp; results — redact what you need.</span></li>
                <li><span className="ck">✓</span><span>OpenTelemetry export to Datadog, Honeycomb, or your own collector.</span></li>
                <li><span className="ck">✓</span><span>Self-host on a single VM. No Kafka, no Cassandra.</span></li>
              </ul>
            </div>
            <div className="code-stack">
              <div className="code-window">
                <div className="code-tabs">
                  <button className="code-tab active" data-tab="ts">checkout-agent.ts</button>
                  <button className="code-tab" data-tab="py">checkout_agent.py <span className="mono muted">· soon</span></button>
                  <button className="code-tab" data-tab="curl">curl</button>
                  <div className="code-run">
                    <button id="run-example" className="run-btn">
                      <span className="run-tri">▶</span>
                      <span className="run-lbl">Run example</span>
                    </button>
                  </div>
                </div>
                <pre className="code-pre" data-tab="ts" dangerouslySetInnerHTML={{ __html: TS_CODE }} />
                <pre className="code-pre" data-tab="py" hidden dangerouslySetInnerHTML={{ __html: PY_CODE }} />
                <pre className="code-pre" data-tab="curl" hidden dangerouslySetInnerHTML={{ __html: CURL_CODE }} />
              </div>

              <div className="run-out" id="run-out" hidden>
                <div className="ro-head">
                  <span className="mono">OUTPUT · t_4f8a</span>
                  <span className="ro-clock mono" id="run-clock">0ms</span>
                </div>
                <ol className="ro-list" id="run-list"></ol>
                <div className="ro-foot mono" id="run-foot"></div>
              </div>
            </div>
          </div>
        </section>

        {/* COST CALCULATOR */}
        <section className="calc" id="calc">
          <div className="calc-head">
            <div className="spot-tag mono">CALCULATOR</div>
            <h2>What you&apos;re spending. What you&apos;d save.</h2>
            <p className="spot-lede">
              Rough numbers. Tune the sliders to your traffic. Recommendations typically reclaim 8–14% by routing to a
              cheaper-equivalent model on suitable spans.
            </p>
          </div>
          <div className="calc-card">
            <div className="calc-controls">
              <div className="cc-row">
                <div className="cc-l">
                  <span className="cc-k mono">DAILY TRACES</span>
                  <span className="cc-v mono" id="cc-traces">10,000</span>
                </div>
                <input type="range" id="r-traces" min="100" max="500000" step="100" defaultValue="10000" />
              </div>
              <div className="cc-row">
                <div className="cc-l">
                  <span className="cc-k mono">AVG TOKENS / TRACE</span>
                  <span className="cc-v mono" id="cc-tokens">2,400</span>
                </div>
                <input type="range" id="r-tokens" min="200" max="20000" step="100" defaultValue="2400" />
              </div>
              <div className="cc-row">
                <div className="cc-l">
                  <span className="cc-k mono">PRIMARY MODEL</span>
                </div>
                <div className="cc-model" role="radiogroup" aria-label="model">
                  <button className="on" data-model="gpt-4o" data-rate="6.25">gpt-4o</button>
                  <button data-model="gpt-4o-mini" data-rate="0.45">gpt-4o-mini</button>
                  <button data-model="claude-3.5-sonnet" data-rate="6.00">claude-3.5-sonnet</button>
                  <button data-model="claude-3-haiku" data-rate="0.50">claude-3-haiku</button>
                </div>
              </div>
              <div className="cc-row">
                <div className="cc-l">
                  <span className="cc-k mono">REC ADOPTION</span>
                  <span className="cc-v mono" id="cc-adopt">60%</span>
                </div>
                <input type="range" id="r-adopt" min="0" max="100" step="5" defaultValue="60" />
              </div>
            </div>

            <div className="calc-out">
              <div className="co-block">
                <div className="co-k mono">CURRENT · MONTHLY</div>
                <div className="co-v" id="cc-cur">$0</div>
                <div className="co-sub mono muted" id="cc-cur-sub">0 traces · 0 tokens</div>
              </div>
              <div className="co-arrow">→</div>
              <div className="co-block hl">
                <div className="co-k mono">WITH AGENTGRAPH</div>
                <div className="co-v" id="cc-new">$0</div>
                <div className="co-sub mono" id="cc-save"><span className="ok">▼ $0</span> saved · 0%</div>
              </div>
            </div>
          </div>
        </section>

        {/* PRINCIPLES */}
        <section className="principles">
          <div className="pr-head">
            <div className="spot-tag mono">PRINCIPLES</div>
            <h2>Three things AgentGraph will never do.</h2>
          </div>
          <div className="pr-grid">
            <div className="pr-card">
              <div className="pr-n mono">01</div>
              <h4>Rewrite your prompts.</h4>
              <p>
                We tell you what your prompt cost and how it performed. The prompt is yours. We don&apos;t suggest
                &quot;better&quot; phrasings or A/B them behind your back.
              </p>
            </div>
            <div className="pr-card">
              <div className="pr-n mono">02</div>
              <h4>Route your model calls.</h4>
              <p>
                No proxy. No middleware in your request path. Your agent talks to OpenAI; we read the trace after. If
                we&apos;re down, you don&apos;t notice.
              </p>
            </div>
            <div className="pr-card">
              <div className="pr-n mono">03</div>
              <h4>Train on your data.</h4>
              <p>
                Your traces, prompts, and tool arguments are not used to train any model — ours or anyone else&apos;s. EU + US
                regions; redact at the SDK.
              </p>
            </div>
          </div>
        </section>

        {/* COMPARISON */}
        <section className="compare" id="compare">
          <div className="cmp-head">
            <div className="spot-tag mono">POSITIONING</div>
            <h2>What we do that the tools you already have don&apos;t.</h2>
            <p className="spot-lede">
              We&apos;re not replacing your APM. We sit on top of it, focused on the one surface those tools can&apos;t see well:
              the loop your agent runs.
            </p>
          </div>

          <div className="cmp-wrap">
            <table className="cmp">
              <thead>
                <tr>
                  <th className="cmp-row-h"></th>
                  <th className="cmp-us mono">AgentGraph</th>
                  <th className="mono">Datadog APM</th>
                  <th className="mono">LangSmith</th>
                  <th className="mono">OTel alone</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Span-level trace of agent loop</td><td className="us"><span className="ck">✓</span></td><td><span className="ck dim">~</span></td><td><span className="ck">✓</span></td><td><span className="ck">✓</span></td></tr>
                <tr><td>Tool calls (not just LLMs)</td><td className="us"><span className="ck">✓</span></td><td><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="ck">✓</span></td></tr>
                <tr><td>USD on every span, live rates</td><td className="us"><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="ck dim">~</span></td><td><span className="x">✕</span></td></tr>
                <tr><td>Tool-swap recommendations</td><td className="us"><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="x">✕</span></td><td><span className="x">✕</span></td></tr>
                <tr><td>Schema-aware compare drawer</td><td className="us"><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="x">✕</span></td><td><span className="x">✕</span></td></tr>
                <tr><td>Self-host on a single VM</td><td className="us"><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="ck dim">~</span></td><td><span className="ck">✓</span></td></tr>
                <tr><td>OTLP export to your stack</td><td className="us"><span className="ck">✓</span></td><td><span className="ck">✓</span></td><td><span className="x">✕</span></td><td><span className="ck">✓</span></td></tr>
                <tr><td>Time to first trace</td><td className="us mono">~2 min</td><td className="mono">≥30 min</td><td className="mono">~5 min</td><td className="mono">≥1 hr</td></tr>
              </tbody>
            </table>
          </div>
          <div className="cmp-note mono muted">
            Drawn from public docs · last updated 2026·05·10. Send corrections to{" "}
            <a className="link" href="#">hello@agentgraph.dev</a>.
          </div>
        </section>

        {/* PRICING */}
        <section className="pricing" id="pricing">
          <div className="pr-head">
            <div className="spot-tag mono">PRICING</div>
            <h2>Pay for traces, not seats.</h2>
          </div>
          <div className="price-grid">
            <article className="price-card">
              <div className="pc-name mono">FREE</div>
              <div className="pc-amt"><span className="pc-num">$0</span><span className="pc-per">/mo</span></div>
              <div className="pc-sub muted">For prototypes and side projects.</div>
              <ul className="pc-feat">
                <li><span className="ck">✓</span> 10,000 traces / month</li>
                <li><span className="ck">✓</span> 7-day retention</li>
                <li><span className="ck">✓</span> All SDKs, OTLP export</li>
                <li><span className="ck">✓</span> Community Discord</li>
              </ul>
              <a className="btn btn-secondary" href="#">Start free <span className="arr">→</span></a>
            </article>
            <article className="price-card hl">
              <div className="pc-name mono">SCALE</div>
              <div className="pc-amt"><span className="pc-num">$0.10</span><span className="pc-per"> / 1K traces</span></div>
              <div className="pc-sub muted">After the first 10,000. Volume discounts at 50M.</div>
              <ul className="pc-feat">
                <li><span className="ck">✓</span> Unlimited retention</li>
                <li><span className="ck">✓</span> SSO &amp; SCIM</li>
                <li><span className="ck">✓</span> Recommendations + GitHub PRs</li>
                <li><span className="ck">✓</span> Self-host (single VM)</li>
                <li><span className="ck">✓</span> Dedicated Slack channel</li>
              </ul>
              <a className="btn btn-primary" href="#">Talk to us <span className="arr">→</span></a>
            </article>
          </div>
          <div className="price-foot mono muted">
            EU + US regions · SOC 2 Type II in progress · <a className="link" href="#">full pricing →</a>
          </div>
        </section>

        {/* FAQ */}
        <section className="faq" id="faq">
          <div className="faq-head">
            <div className="spot-tag mono">QUESTIONS</div>
            <h2>The ones engineers actually ask us.</h2>
          </div>
          <div className="faq-list">
            <details>
              <summary>Do you store my prompts and completions?</summary>
              <p>
                By default, yes — that&apos;s the whole point of a trace. You can disable storage globally, redact specific
                fields at the SDK, or hash inputs/outputs before they leave your process. EU data stays in EU. We never train on
                customer data.
              </p>
            </details>
            <details>
              <summary>How is this different from LangSmith?</summary>
              <p>
                LangSmith is an LLM evaluations platform that includes tracing. AgentGraph is a runtime observability +
                tool-intelligence layer that includes tool recommendations. We OTLP-export to LangSmith if you want both. Most
                teams use AgentGraph for production, LangSmith for prompt iteration.
              </p>
            </details>
            <details>
              <summary>Can I self-host?</summary>
              <p>
                Yes, on the Scale plan. A single Postgres + Clickhouse instance handles ~40M spans/day on commodity hardware.
                We ship a Helm chart and a docker-compose. Recommendations are the only feature that requires reaching our
                control plane (an opt-in feature).
              </p>
            </details>
            <details>
              <summary>Which models and providers do you support?</summary>
              <p>
                Cost attribution: OpenAI, Anthropic, Mistral, Groq, Together, Bedrock (including Claude on Bedrock), Vertex
                (Gemini), Azure OpenAI, Cohere. Auto-instrumentation: OpenAI &amp; Anthropic SDKs today; Bedrock + Vertex
                shipping this quarter. Anything else, you trace manually with <code>t.step()</code>.
              </p>
            </details>
            <details>
              <summary>Are you in my request path?</summary>
              <p>
                No. The SDK buffers spans in-process and ships them to us out of band. If AgentGraph is down, your agent
                doesn&apos;t notice — spans queue up locally. We&apos;re never a proxy.
              </p>
            </details>
            <details>
              <summary>What happens if I exceed the free tier?</summary>
              <p>
                When you hit your plan&apos;s free trace limit, new ingests get a <code>402</code> response and we email you.
                Opt in to billing to keep ingesting — we won&apos;t surprise-charge you before you do.
              </p>
            </details>
          </div>
        </section>

        {/* CHANGELOG */}
        <section className="changelog" id="changelog">
          <div className="cl-head">
            <div className="spot-tag mono">CHANGELOG</div>
            <h2>Recent ships.</h2>
            <a className="btn-link" href="#">All releases →</a>
          </div>
          <ul className="cl-list">
            <li>
              <div className="cl-meta mono"><span className="cl-v">v0.4.2</span><span className="muted">2026·05·14</span></div>
              <div className="cl-body">
                <b>Span-level OTLP export.</b> Push individual spans to your existing OpenTelemetry collector — no batching at
                our end, no buffering in your process.
              </div>
            </li>
            <li>
              <div className="cl-meta mono"><span className="cl-v">v0.4.1</span><span className="muted">2026·05·02</span></div>
              <div className="cl-body">
                <b>Recommendations: shadow mode.</b> Score a suggested tool against live traffic without routing to it.
                Surfaces in the same compare drawer.
              </div>
            </li>
            <li>
              <div className="cl-meta mono"><span className="cl-v">v0.4.0</span><span className="muted">2026·04·18</span></div>
              <div className="cl-body">
                <b>Tool registry &amp; PRs.</b> Connect a GitHub repo as your tool registry. Recommendations open a branch with
                the swap, scored.
              </div>
            </li>
            <li>
              <div className="cl-meta mono"><span className="cl-v">v0.3.7</span><span className="muted">2026·04·02</span></div>
              <div className="cl-body">
                <b>Python SDK.</b> Same surface as TS — <code>ag.trace()</code>, <code>t.step()</code>, <code>t.tool()</code>.
                Auto-instruments <code>openai</code> and <code>anthropic</code>.
              </div>
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section className="cta" id="docs">
          <div className="cta-inner">
            <h2>
              Two minutes from <code className="cta-code">npm install</code> to a trace.
            </h2>
            <p>Private beta. Free for the first 10,000 traces / month. No credit card.</p>
            <div className="cta-ctas">
              <a className="btn btn-primary btn-lg" href="#">Get an API key <span className="arr">→</span></a>
              <a className="btn-link btn-lg" href="#">Talk to an engineer →</a>
            </div>
            <div className="cta-foot mono">SOC 2 Type II in progress · self-host on Scale · EU + US regions</div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="foot-grid">
          <div className="foot-brand">
            <a className="brand">
              <BrandMark />
              <span>AgentGraph</span>
            </a>
            <p>The runtime tool-intelligence layer for AI agents.</p>
          </div>
          <div className="foot-col">
            <h5>Product</h5>
            <ul>
              <li><a>Traces</a></li>
              <li><a>Cost Explorer</a></li>
              <li><a>Tool Registry</a></li>
              <li><a>Recommendations</a></li>
              <li><a>Changelog</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Developers</h5>
            <ul>
              <li><a>Quickstart</a></li>
              <li><a>SDK reference</a></li>
              <li><a>Auto-instrumentation</a></li>
              <li><a>OTLP export</a></li>
              <li><a>Status</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Company</h5>
            <ul>
              <li><a>About</a></li>
              <li><a>Pricing</a></li>
              <li><a>Security</a></li>
              <li><a>Careers</a></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Connect</h5>
            <ul>
              <li><a>GitHub</a></li>
              <li><a>Discord</a></li>
              <li><a>X / Twitter</a></li>
              <li><a>hello@agentgraph.dev</a></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <div className="foot-meta">
            <a className="foot-status" href="#">
              <span className="fs-dot"></span>
              <span>All systems operational</span>
              <span className="muted">status.agentgraph.dev →</span>
            </a>
            <span className="foot-lic mono">SDK is <b>MIT</b> · control plane is <b>BSL 1.1</b></span>
          </div>
          <div className="foot-meta">
            <span className="mono">© 2026 AgentGraph, Inc.</span>
            <a className="foot-build mono" href="#" title="View commit on GitHub">
              v0.4.2 · build <b>a18f3c</b> <span className="muted">→</span>
            </a>
          </div>
        </div>
      </footer>

      <aside className="live-counter" aria-live="polite">
        <div className="lc-row">
          <span className="lc-dot"></span>
          <span className="lc-k mono">SPANS · last 60s</span>
        </div>
        <div className="lc-v mono" id="lc-spans">0</div>
        <div className="lc-row lc-foot mono">
          <span className="muted" id="lc-rate">+0/s</span>
          <span className="muted">global</span>
        </div>
      </aside>

      <LandingClient />
    </>
  );
}

const TS_CODE = `<span class="c-kw">import</span> { AgentGraph } <span class="c-kw">from</span> <span class="c-str">"@agentgraph/sdk"</span>;
<span class="c-kw">import</span> { stripe, postmark, openai } <span class="c-kw">from</span> <span class="c-str">"./tools"</span>;

<span class="c-kw">const</span> <span class="c-var">ag</span> = <span class="c-kw">new</span> <span class="c-fn">AgentGraph</span>({ apiKey: process.env.<span class="c-var">AG_KEY</span> });

<span class="c-kw">export async function</span> <span class="c-fn">checkout</span>(<span class="c-var">order</span>: <span class="c-dim">Order</span>) {
  <span class="c-kw">const</span> <span class="c-var">trace</span> = ag.<span class="c-fn">trace</span>({
    agentId: <span class="c-str">"checkout-agent"</span>,
    sessionId: order.<span class="c-var">sessionId</span>,
    userId: order.<span class="c-var">userId</span>,
  });

  <span class="c-co">// each step records latency + cost; pass a StepType + name</span>
  <span class="c-kw">const</span> ctx = <span class="c-kw">await</span> trace.<span class="c-fn">step</span>(<span class="c-str">"retrieval"</span>, <span class="c-str">"fetch_context"</span>, <span class="c-kw">async</span> (span) =&gt; {
    span.<span class="c-fn">setInput</span>({ orderId: order.<span class="c-var">id</span> });
    <span class="c-kw">const</span> docs = <span class="c-kw">await</span> <span class="c-fn">fetchContext</span>(order);
    span.<span class="c-fn">setOutput</span>({ docs });
    <span class="c-kw">return</span> docs;
  });

  <span class="c-kw">const</span> plan = <span class="c-kw">await</span> trace.<span class="c-fn">step</span>(<span class="c-str">"llm_call"</span>, <span class="c-str">"plan"</span>, <span class="c-kw">async</span> (span) =&gt; {
    span.<span class="c-fn">setModel</span>(<span class="c-str">"gpt-4o"</span>).<span class="c-fn">setInput</span>({ ctx });
    <span class="c-kw">return</span> openai.<span class="c-fn">complete</span>(ctx);
  });

  <span class="c-kw">await</span> trace.<span class="c-fn">step</span>(<span class="c-str">"tool_call"</span>, <span class="c-str">"stripe.charge"</span>, () =&gt; stripe.<span class="c-fn">charge</span>(order));
  <span class="c-kw">await</span> trace.<span class="c-fn">step</span>(<span class="c-str">"tool_call"</span>, <span class="c-str">"postmark.send"</span>, () =&gt; postmark.<span class="c-fn">send</span>(order));

  <span class="c-kw">await</span> trace.<span class="c-fn">flush</span>(); <span class="c-co">// POST /v1/ingest</span>
  <span class="c-kw">return</span> { ok: <span class="c-num">true</span>, plan };
}`;

const PY_CODE = `<span class="c-co"># Python SDK — coming soon.</span>
<span class="c-co">#</span>
<span class="c-co"># We're building a native Python client with the same</span>
<span class="c-co"># trace / step API as the TypeScript SDK.</span>
<span class="c-co">#</span>
<span class="c-co"># Until then, any Python service can ingest traces by</span>
<span class="c-co"># POSTing to /v1/ingest directly — see the curl tab.</span>`;

const CURL_CODE = `<span class="c-co"># no SDK? POST a trace directly.</span>
curl -X POST https://agentgraph.dev/v1/ingest \\
  -H <span class="c-str">"Authorization: Bearer $AG_KEY"</span> \\
  -H <span class="c-str">"Content-Type: application/json"</span> \\
  -d <span class="c-str">'{
    "agentId": "checkout-agent",
    "env": "prod",
    "status": "completed",
    "steps": [
      {
        "type": "llm_call",
        "name": "plan",
        "model": "gpt-4o",
        "input": { "ctx": "..." },
        "tokenUsage": { "prompt": 1820, "completion": 412, "total": 2232 }
      },
      {
        "type": "tool_call",
        "name": "stripe.charge",
        "toolName": "stripe",
        "latencyMs": 328,
        "costUsd": 0.004,
        "input": { "amount": 8240, "currency": "usd" }
      }
    ]
  }'</span>`;
