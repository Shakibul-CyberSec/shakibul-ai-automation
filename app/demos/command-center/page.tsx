'use client';

import { useEffect, useRef, useState } from 'react';
import {
  agoLabel,
  computeIndustries,
  computeKpis,
  computeTemperature,
  makeRandomLead,
  makeTicker,
  type CommandMode,
  type Lead,
} from './config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 4 — OPS COMMAND CENTER — CLIENT PAGE
   A live operations board for the leads Demo 1's intake pipeline scores.
   It reads the same Supabase data through the same-origin bridge
   (/api/demo/command-center) — the browser never touches Supabase, so
   the site's strict CSP stays intact and no key is ever exposed.

   Two modes, one render:
     • live      → poll the bridge every few seconds; server is source of truth.
     • simulated → seed from the bridge, then inject synthetic leads on a
                   timer so the board is always visibly alive.

   CSP-safe: no inline styles. The only dynamic sizes (bars) are set via a
   ref; the donut uses SVG presentation attributes, not the style attr.
   ═══════════════════════════════════════════════════════════════ */

const POLL_MS = 3200;      // live: how often we re-read the bridge
const SIM_MIN_MS = 6000;   // simulated: gap floor between synthetic arrivals
const SIM_MAX_MS = 9500;   // simulated: gap ceiling
const MAX_LEADS = 30;

const FLOW = [
  { icon: '📨', label: 'Intake', sub: 'Demo 1 scores a lead' },
  { icon: '🗄️', label: 'Store', sub: 'lands in your Supabase' },
  { icon: '🛰️', label: 'Bridge', sub: 'same-origin, PII-safe' },
  { icon: '📊', label: 'Command center', sub: 'live on this board' },
];

/* Animated integer — eases from the old value to the new one whenever it
   changes; snaps instantly if the visitor prefers reduced motion. */
function CountUp({ value, duration = 650 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);
  return <>{display}</>;
}

/* Horizontal bar — width set through a ref (no inline style attribute). */
function Bar({ count, max }: { count: number; max: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  useEffect(() => {
    if (ref.current) ref.current.style.width = `${pct}%`;
  }, [pct]);
  return (
    <span className="cmd-bar-track">
      <span className="cmd-bar-fill" ref={ref} />
    </span>
  );
}

/* Temperature donut — pure SVG. strokeDasharray/offset/transform are SVG
   presentation attributes (allowed under CSP); colours come from classes. */
function Donut({ hot, warm, cold }: { hot: number; warm: number; cold: number }) {
  const total = hot + warm + cold;
  const R = 42;
  const C = 2 * Math.PI * R;
  const segs = [
    { key: 'hot', val: hot, cls: 'cmd-arc--hot' },
    { key: 'warm', val: warm, cls: 'cmd-arc--warm' },
    { key: 'cold', val: cold, cls: 'cmd-arc--cold' },
  ].filter((s) => s.val > 0);

  let acc = 0;
  const arcs = segs.map((s) => {
    const len = total > 0 ? (s.val / total) * C : 0;
    const offset = acc;
    acc += len;
    return { ...s, len, offset };
  });

  return (
    <svg
      className="cmd-donut"
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Hot ${hot}, warm ${warm}, cold ${cold}`}
    >
      <circle className="cmd-arc-bg" cx="50" cy="50" r={R} fill="none" strokeWidth="11" />
      {arcs.map((a) => (
        <circle
          key={a.key}
          className={`cmd-arc ${a.cls}`}
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="11"
          strokeLinecap="butt"
          strokeDasharray={`${a.len} ${C - a.len}`}
          strokeDashoffset={-a.offset}
          transform="rotate(-90 50 50)"
        />
      ))}
      <text className="cmd-donut-num" x="50" y="48" textAnchor="middle">
        {total}
      </text>
      <text className="cmd-donut-lbl" x="50" y="62" textAnchor="middle">
        leads today
      </text>
    </svg>
  );
}

export default function CommandCenterDemo() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [mode, setMode] = useState<CommandMode>('simulated');
  const [ready, setReady] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [showFlow, setShowFlow] = useState(false);

  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mark every lead currently on screen as "seen" AFTER paint, so only
  // genuinely new arrivals get the highlight animation on their first render.
  useEffect(() => {
    leads.forEach((l) => seenRef.current.add(l.id));
  }, [leads]);

  useEffect(() => {
    let cancelled = false;

    async function fetchSnapshot() {
      try {
        const res = await fetch('/api/demo/command-center', { cache: 'no-store' });
        return (await res.json()) as {
          success?: boolean;
          mode?: CommandMode;
          snapshot?: { leads: Lead[] };
        };
      } catch {
        return null;
      }
    }

    function scheduleSim() {
      const gap = SIM_MIN_MS + Math.random() * (SIM_MAX_MS - SIM_MIN_MS);
      timerRef.current = setTimeout(() => {
        if (cancelled) return;
        setLeads((prev) => [makeRandomLead(Date.now()), ...prev].slice(0, MAX_LEADS));
        setNowMs(Date.now());
        scheduleSim();
      }, gap);
    }

    function schedulePoll() {
      timerRef.current = setTimeout(async () => {
        if (cancelled) return;
        const data = await fetchSnapshot();
        if (!cancelled && data?.snapshot?.leads) {
          setLeads(data.snapshot.leads.slice(0, MAX_LEADS));
          setNowMs(Date.now());
        }
        schedulePoll();
      }, POLL_MS);
    }

    (async () => {
      const data = await fetchSnapshot();
      if (cancelled) return;
      const initial = data?.snapshot?.leads ?? [];
      // seed "seen" so the first batch doesn't all flash at once
      initial.forEach((l) => seenRef.current.add(l.id));
      setLeads(initial.slice(0, MAX_LEADS));
      setMode(data?.mode ?? 'simulated');
      setNowMs(Date.now());
      setReady(true);
      if ((data?.mode ?? 'simulated') === 'live') schedulePoll();
      else scheduleSim();
    })();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Keep the "x ago" labels fresh even between arrivals.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  const kpis = computeKpis(leads);
  const temp = computeTemperature(leads);
  const industries = computeIndustries(leads);
  const ticker = makeTicker(leads, 5);
  const maxIndustry = industries.reduce((m, i) => Math.max(m, i.count), 0);
  const isLive = mode === 'live';
  const avgRespSec = (kpis.avg_response_ms / 1000).toFixed(1);

  return (
    <main className="cmd-main">
      <div className="mesh-bg" aria-hidden="true">
        <div className="mesh-orb mesh-orb--amber gpu" />
        <div className="mesh-orb mesh-orb--rose gpu" />
        <div className="mesh-orb mesh-orb--cyan gpu" />
      </div>
      <div className="grid-overlay" aria-hidden="true" />

      <div className="cmd-shell">
        {/* ── Header ── */}
        <header className="cmd-header">
          <a href="/#work" className="cmd-back">
            <span aria-hidden="true">←</span> Back to site
          </a>
          <p className="cmd-eyebrow">Live demo · Ops command center</p>
          <h1 className="cmd-title">Ops Command Center</h1>
          <p className="cmd-sub">
            Every lead your intake pipeline scores, live on one board — temperature,
            routing, and response time at a glance. This is what Demo&nbsp;1 looks like
            from the operator&rsquo;s chair.
          </p>
        </header>

        {/* ── Status strip ── */}
        <div className="cmd-status">
          <span className={`cmd-badge${isLive ? ' cmd-badge-live' : ''}`}>
            <span className="cmd-pulse" aria-hidden="true" />
            {isLive ? 'LIVE (Supabase)' : 'SIMULATED'}
          </span>
          <span className="cmd-status-note">
            {ready
              ? isLive
                ? 'Reading your Supabase leads'
                : 'Simulated live stream — connect Supabase to go live'
              : 'Connecting to the ops feed…'}
          </span>
        </div>

        {/* ── KPI row ── */}
        <div className="cmd-kpis">
          <div className="cmd-kpi glass">
            <span className="cmd-kpi-val counter-value">
              <CountUp value={kpis.total_today} />
            </span>
            <span className="cmd-kpi-lbl">Leads today</span>
          </div>
          <div className="cmd-kpi glass">
            <span className="cmd-kpi-val counter-value cmd-kpi-hot">
              <CountUp value={kpis.hot} />
            </span>
            <span className="cmd-kpi-lbl">Hot leads</span>
          </div>
          <div className="cmd-kpi glass">
            <span className="cmd-kpi-val counter-value">
              <CountUp value={kpis.avg_score} />
            </span>
            <span className="cmd-kpi-lbl">Avg score</span>
          </div>
          <div className="cmd-kpi glass">
            <span className="cmd-kpi-val counter-value">{ready ? `${avgRespSec}s` : '—'}</span>
            <span className="cmd-kpi-lbl">Avg response</span>
          </div>
        </div>

        {/* ── Main grid: feed + side panels ── */}
        <div className="cmd-grid">
          {/* Live lead feed — the centerpiece */}
          <section className="cmd-feed glass glass-glow">
            <div className="cmd-panel-bar">
              <span className="cmd-panel-name">
                <span className="glow-dot glow-dot--sm" /> Live lead feed
              </span>
              <span className="cmd-panel-count">{leads.length} shown</span>
            </div>

            {!ready ? (
              <div className="cmd-empty">
                <span className="spinner" aria-hidden="true" /> Connecting…
              </div>
            ) : leads.length === 0 ? (
              <div className="cmd-empty">No leads yet — they&rsquo;ll appear here the moment they land.</div>
            ) : (
              <ul className="cmd-rows">
                {leads.map((l) => {
                  const isNew = !seenRef.current.has(l.id);
                  return (
                    <li key={l.id} className={`cmd-row${isNew ? ' cmd-row--new' : ''}`}>
                      <span className={`cmd-temp cmd-temp--${l.temperature.toLowerCase()}`}>
                        {l.temperature}
                      </span>
                      <div className="cmd-row-main">
                        <span className="cmd-row-head">{l.headline}</span>
                        <span className="cmd-row-meta">
                          {l.industry_label} · routed to {l.channel_label} ·{' '}
                          {agoLabel(l.created_at, nowMs)}
                        </span>
                      </div>
                      <span className="cmd-row-score">{l.score}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Side panels */}
          <div className="cmd-side">
            <section className="cmd-card glass">
              <div className="cmd-card-title">Lead temperature</div>
              <div className="cmd-donut-wrap">
                <Donut hot={temp.hot} warm={temp.warm} cold={temp.cold} />
                <ul className="cmd-legend">
                  <li>
                    <span className="cmd-key cmd-key--hot" /> Hot <b>{temp.hot}</b>
                  </li>
                  <li>
                    <span className="cmd-key cmd-key--warm" /> Warm <b>{temp.warm}</b>
                  </li>
                  <li>
                    <span className="cmd-key cmd-key--cold" /> Cold <b>{temp.cold}</b>
                  </li>
                </ul>
              </div>
            </section>

            <section className="cmd-card glass">
              <div className="cmd-card-title">Industry mix</div>
              <ul className="cmd-bars">
                {industries.map((i) => (
                  <li key={i.key} className="cmd-bar-row">
                    <span className="cmd-bar-lbl">{i.label}</span>
                    <Bar count={i.count} max={maxIndustry} />
                    <span className="cmd-bar-num">{i.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="cmd-card glass">
              <div className="cmd-card-title">Activity</div>
              <ul className="cmd-ticker">
                {ticker.length === 0 ? (
                  <li className="cmd-ticker-line">Waiting for activity…</li>
                ) : (
                  ticker.map((line, i) => (
                    <li key={`${line}-${i}`} className="cmd-ticker-line">
                      <span className="cmd-ticker-dot" aria-hidden="true" />
                      {line}
                    </li>
                  ))
                )}
              </ul>
            </section>
          </div>
        </div>

        {/* ── The flow ── */}
        <div className="cmd-flow-wrap">
          <button
            type="button"
            className="cmd-flow-toggle"
            onClick={() => setShowFlow((v) => !v)}
            aria-expanded={showFlow}
          >
            {showFlow ? '▾ Hide the flow' : '▸ See the flow'}
          </button>
          {showFlow && (
            <div className="cmd-flow result-pop">
              {FLOW.map((f, i) => (
                <div key={f.label} className="cmd-flow-step">
                  <span className="cmd-flow-icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span className="cmd-flow-label">{f.label}</span>
                  <span className="cmd-flow-sub">{f.sub}</span>
                  {i < FLOW.length - 1 && (
                    <span className="cmd-flow-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="cmd-flow-note">
            Runs on your own Supabase — your data, your cloud. The board reads only
            non-personal fields (industry, score, routing), never a customer&rsquo;s
            name or contact.
          </p>
        </div>

        {/* ── CTA ── */}
        <div className="cmd-cta glass glass-glow">
          <div>
            <p className="cmd-cta-title">Want this command center for your operations?</p>
            <p className="cmd-cta-sub">
              One live board across intake, scoring, and routing — wired to your tools,
              running in your own cloud.
            </p>
          </div>
          <a href="/#contact" className="cmd-btn cmd-btn-primary btn-shine">
            Get this for your business →
          </a>
        </div>
      </div>
    </main>
  );
}
