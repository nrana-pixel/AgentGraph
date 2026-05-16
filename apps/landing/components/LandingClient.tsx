"use client";
import { useEffect } from "react";

export default function LandingClient() {
  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Seed bar widths so they can animate from 0
    document.querySelectorAll<HTMLElement>(".bl-fill").forEach((el) => {
      el.style.setProperty("--target-w", el.dataset["w"] || "0");
    });
    document.querySelectorAll<HTMLElement>(".sm-fill").forEach((el) => {
      if (el.dataset["seeded"]) return;
      const w = el.style.width || "0%";
      el.style.setProperty("--target-w", w);
      el.style.width = "0%";
      el.dataset["seeded"] = "1";
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const t = entry.target as HTMLElement;
          t.classList.add("in");
          t.querySelectorAll<HTMLElement>("[data-count]").forEach((node) => {
            const target = parseFloat(node.dataset["count"] || "0");
            const format = node.dataset["format"] || "num";
            const dur = 1200;
            const start = performance.now();
            function tick(now: number) {
              const p = Math.min(1, (now - start) / dur);
              const eased = 1 - Math.pow(1 - p, 3);
              const v = target * eased;
              node.textContent =
                format === "dec"
                  ? v.toFixed((target.toString().split(".")[1] || "").length || 1)
                  : Math.round(v).toLocaleString("en-US");
              if (p < 1) requestAnimationFrame(tick);
              else
                node.textContent =
                  format === "dec"
                    ? target.toString()
                    : Math.round(target).toLocaleString("en-US");
            }
            node.textContent = "0";
            requestAnimationFrame(tick);
          });
          io.unobserve(t);
        });
      },
      { threshold: 0.2 },
    );

    if (!reduceMotion) {
      document
        .querySelectorAll(".reveal, .annotated-trace, .swap-card")
        .forEach((el) => io.observe(el));
    } else {
      document
        .querySelectorAll(".reveal, .annotated-trace, .swap-card")
        .forEach((el) => el.classList.add("in"));
    }

    // Theme toggle
    const themeBtn = document.querySelector(".theme-toggle");
    const onThemeClick = () => {
      const cur = document.documentElement.dataset["theme"] || "dark";
      document.documentElement.dataset["theme"] = cur === "dark" ? "light" : "dark";
    };
    themeBtn?.addEventListener("click", onThemeClick);

    // Code tabs
    const tabBtns = document.querySelectorAll<HTMLButtonElement>(".code-tab");
    const onTabClick = (btn: HTMLButtonElement) => () => {
      const tab = btn.dataset["tab"];
      tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll<HTMLElement>(".code-pre").forEach((p) => {
        p.hidden = p.dataset["tab"] !== tab;
      });
    };
    const tabHandlers = new Map<HTMLButtonElement, () => void>();
    tabBtns.forEach((btn) => {
      const h = onTabClick(btn);
      tabHandlers.set(btn, h);
      btn.addEventListener("click", h);
    });

    // Run example
    const runBtn = document.getElementById("run-example") as HTMLButtonElement | null;
    const runOut = document.getElementById("run-out") as HTMLElement | null;
    const runList = document.getElementById("run-list");
    const runClock = document.getElementById("run-clock");
    const runFoot = document.getElementById("run-foot");
    const fakeSpans = [
      { name: "retrieve_context", lat: 256, cost: 0.0016 },
      { name: "plan · gpt-4o", lat: 594, cost: 0.0091 },
      { name: "stripe.charge", lat: 328, cost: 0.004 },
      { name: "postmark.send", lat: 148, cost: 0.001 },
      { name: "verify · claude-3.5-haiku", lat: 408, cost: 0.0019 },
      { name: "audit_log.write", lat: 73, cost: 0.0 },
    ];
    const runTimeouts: number[] = [];
    const onRun = () => {
      if (!runBtn || !runOut || !runList || !runClock || !runFoot) return;
      if (runBtn.classList.contains("running")) return;
      runBtn.classList.add("running");
      runOut.hidden = false;
      runList.innerHTML = "";
      runFoot.textContent = "";
      let elapsed = 0;
      fakeSpans.forEach((s, i) => {
        const id = window.setTimeout(() => {
          elapsed += s.lat;
          const li = document.createElement("li");
          li.innerHTML = `
            <span class="ro-i mono">${String(i + 1).padStart(2, "0")}</span>
            <span class="ro-n">${s.name}</span>
            <span class="ro-l mono">${s.lat}ms</span>
            <span class="ro-c mono">$${s.cost.toFixed(4)}</span>`;
          runList.appendChild(li);
          runClock.textContent = elapsed + "ms";
          if (i === fakeSpans.length - 1) {
            runFoot.innerHTML = `<span>6 spans · trace complete</span><span class="ok">▼ swap saves $0.0008</span>`;
            runBtn.classList.remove("running");
          }
        }, 150 + i * 280);
        runTimeouts.push(id);
      });
    };
    runBtn?.addEventListener("click", onRun);

    // Calculator
    const rTraces = document.getElementById("r-traces") as HTMLInputElement | null;
    const rTokens = document.getElementById("r-tokens") as HTMLInputElement | null;
    const rAdopt = document.getElementById("r-adopt") as HTMLInputElement | null;
    const modelButtons = document.querySelectorAll<HTMLButtonElement>(".cc-model button");
    let curModel = { name: "gpt-4o", rate: 6.25 };
    const cheaperFor: Record<string, { name: string; rate: number }> = {
      "gpt-4o": { name: "gpt-4o-mini", rate: 0.45 },
      "gpt-4o-mini": { name: "gpt-4o-mini", rate: 0.45 },
      "claude-3.5-sonnet": { name: "claude-3-haiku", rate: 0.5 },
      "claude-3-haiku": { name: "claude-3-haiku", rate: 0.5 },
    };
    const fmt$ = (n: number) => {
      if (n >= 1000) return "$" + Math.round(n).toLocaleString("en-US");
      if (n >= 100) return "$" + n.toFixed(0);
      return "$" + n.toFixed(2);
    };
    const fmtN = (n: number) => Math.round(n).toLocaleString("en-US");
    const calc = () => {
      if (!rTraces || !rTokens || !rAdopt) return;
      const traces = +rTraces.value;
      const tokens = +rTokens.value;
      const adopt = +rAdopt.value / 100;
      const $ = (id: string) => document.getElementById(id);
      $("cc-traces")!.textContent = fmtN(traces);
      $("cc-tokens")!.textContent = fmtN(tokens);
      $("cc-adopt")!.textContent = (adopt * 100).toFixed(0) + "%";
      const totalTokensMo = traces * tokens * 30;
      const current = (totalTokensMo / 1e6) * curModel.rate;
      const swappable = current * 0.3 * adopt;
      const cheaper = cheaperFor[curModel.name] || curModel;
      const cheaperRatio = cheaper.rate / curModel.rate;
      const savings = swappable * (1 - cheaperRatio);
      const next = current - savings;
      $("cc-cur")!.textContent = fmt$(current);
      $("cc-cur-sub")!.textContent =
        fmtN(traces * 30) + " traces · " + fmtN(totalTokensMo) + " tokens";
      $("cc-new")!.textContent = fmt$(next);
      const pct = current > 0 ? (savings / current) * 100 : 0;
      $("cc-save")!.innerHTML = `<span class="ok">▼ ${fmt$(savings)}</span> saved · ${pct.toFixed(1)}%`;
    };
    const onInput = () => calc();
    [rTraces, rTokens, rAdopt].forEach((r) => r?.addEventListener("input", onInput));
    const modelHandlers = new Map<HTMLButtonElement, () => void>();
    modelButtons.forEach((b) => {
      const h = () => {
        modelButtons.forEach((x) => x.classList.toggle("on", x === b));
        curModel = { name: b.dataset["model"] || "gpt-4o", rate: parseFloat(b.dataset["rate"] || "0") };
        calc();
      };
      modelHandlers.set(b, h);
      b.addEventListener("click", h);
    });
    calc();

    // Live counter
    const lcSpans = document.getElementById("lc-spans");
    const lcRate = document.getElementById("lc-rate");
    let lcInterval: number | null = null;
    let lcRateInterval: number | null = null;
    if (lcSpans && lcRate) {
      let n = 64200 + Math.floor(Math.random() * 800);
      let rate = 980 + Math.floor(Math.random() * 80);
      const tickLC = () => {
        n += Math.round(rate / 60 + (Math.random() * 4 - 2));
        lcSpans.textContent = n.toLocaleString("en-US");
        lcRate.textContent = "+" + rate.toLocaleString("en-US") + "/min";
      };
      tickLC();
      lcInterval = window.setInterval(tickLC, 1000);
      lcRateInterval = window.setInterval(() => {
        rate += Math.round(Math.random() * 20 - 10);
        rate = Math.max(820, Math.min(1240, rate));
      }, 4000);
    }

    // Hero live tick
    let heroInterval: number | null = null;
    const heroTimeout = window.setTimeout(() => {
      const hero = document.getElementById("hero-traces");
      if (!hero) return;
      let n = parseInt(hero.dataset["count"] || "0", 10);
      heroInterval = window.setInterval(() => {
        n += 1 + Math.floor(Math.random() * 3);
        hero.textContent = n.toLocaleString("en-US");
      }, 1400);
    }, 2200);

    // Scrollspy
    const navLinks = document.querySelectorAll<HTMLAnchorElement>('.nav-links a[href^="#"]');
    const linkBySec = new Map<Element, HTMLAnchorElement>();
    const sections: Element[] = [];
    navLinks.forEach((a) => {
      const sec = document.querySelector(a.getAttribute("href") || "");
      if (sec) {
        linkBySec.set(sec, a);
        sections.push(sec);
      }
    });
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          navLinks.forEach((a) => a.removeAttribute("data-active"));
          const a = linkBySec.get(e.target);
          if (a) a.dataset["active"] = "true";
        });
      },
      { rootMargin: "-40% 0% -55% 0%" },
    );
    sections.forEach((s) => spy.observe(s));

    return () => {
      io.disconnect();
      spy.disconnect();
      themeBtn?.removeEventListener("click", onThemeClick);
      tabHandlers.forEach((h, btn) => btn.removeEventListener("click", h));
      runBtn?.removeEventListener("click", onRun);
      runTimeouts.forEach((id) => window.clearTimeout(id));
      [rTraces, rTokens, rAdopt].forEach((r) => r?.removeEventListener("input", onInput));
      modelHandlers.forEach((h, btn) => btn.removeEventListener("click", h));
      if (lcInterval) window.clearInterval(lcInterval);
      if (lcRateInterval) window.clearInterval(lcRateInterval);
      if (heroInterval) window.clearInterval(heroInterval);
      window.clearTimeout(heroTimeout);
    };
  }, []);

  return null;
}
