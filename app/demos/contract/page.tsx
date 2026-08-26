'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SAMPLES,
  type ContractMode,
  type ContractResult,
  type Finding,
  type RiskLevel,
  type Severity,
} from './config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 2 — CONTRACT X-RAY — CLIENT PAGE
   Chooser (upload a PDF or click a sample) → analyzing animation →
   forensic risk report (gauge, summary, findings, dates, terms).

   All calls go to the same-origin bridge /api/demo/contract, which
   decides live-vs-simulated. This page never touches n8n directly
   (CSP `connect-src 'self'`). CSP-safe: no inline styles anywhere —
   colors come from classes / SVG presentation attributes.
   ═══════════════════════════════════════════════════════════════ */

type Phase = 'idle' | 'processing' | 'result' | 'error';

const RADIUS = 54;
const CIRC = 2 * Math.PI * RADIUS;
const MAX_BYTES = 10 * 1024 * 1024;

const STEPS = [
  { key: 'extract', label: 'Extracting text', icon: '📄' },
  { key: 'parse', label: 'Parsing clauses', icon: '🔎' },
  { key: 'assess', label: 'Assessing risk', icon: '⚖️' },
  { key: 'compile', label: 'Compiling report', icon: '📊' },
] as const;

const ENGINE = [
  { icon: '📥', label: 'Document in', sub: 'PDF or sample' },
  { icon: '📄', label: 'Extract text', sub: 'page by page' },
  { icon: '✂️', label: 'Chunk & cap', sub: 'fit the model' },
  { icon: '🧠', label: 'Forensic AI', sub: 'clause review' },
  { icon: '{ }', label: 'Structured JSON', sub: 'typed result' },
  { icon: '🧾', label: 'Report', sub: 'this view' },
];

const SEV_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SEV_LABEL: Record<Severity, string> = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

const LEVEL_STROKE: Record<RiskLevel, string> = {
  HIGH: '#f43f5e',
  MEDIUM: '#f59e0b',
  LOW: '#10b981',
};
const LEVEL_TEXT: Record<RiskLevel, string> = {
  HIGH: 'xray-txt-high',
  MEDIUM: 'xray-txt-medium',
  LOW: 'xray-txt-low',
};
const LEVEL_WORD: Record<RiskLevel, string> = {
  HIGH: 'High risk',
  MEDIUM: 'Medium risk',
  LOW: 'Low risk',
};

function sampleLabel(key: string): string {
  const s = SAMPLES.find((x) => x.key === key);
  return s ? s.label : 'your document';
}

export default function ContractXrayPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<ContractResult | null>(null);
  const [mode, setMode] = useState<ContractMode>('sample');
  const [errorMsg, setErrorMsg] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [stepIdx, setStepIdx] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [visibleFindings, setVisibleFindings] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [showEngine, setShowEngine] = useState(false);

  const runningRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---- analyzing step ticker ---- */
  useEffect(() => {
    if (phase !== 'processing') return;
    setStepIdx(0);
    const id = setInterval(() => setStepIdx((s) => (s + 1) % STEPS.length), 620);
    return () => clearInterval(id);
  }, [phase]);

  /* ---- gauge count-up on result ---- */
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    const score = result.overall_risk.score;
    const DURATION = 1000;
    let rafId = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(score * eased));
      if (p < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [phase, result]);

  /* ---- staggered finding reveal ---- */
  useEffect(() => {
    if (phase !== 'result' || !result) {
      setVisibleFindings(0);
      return;
    }
    setVisibleFindings(0);
    const total = result.findings.length;
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleFindings(i);
      if (i >= total) clearInterval(id);
    }, 130);
    return () => clearInterval(id);
  }, [phase, result]);

  const analyze = useCallback(async (init: RequestInit) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPhase('processing');
    setErrorMsg('');
    const started = performance.now();
    let data: { success?: boolean; mode?: ContractMode; result?: ContractResult; error?: string } | null = null;
    try {
      const res = await fetch('/api/demo/contract', init);
      data = await res.json();
    } catch {
      data = null;
    }
    // Guarantee the animation is readable even if the API is instant.
    const wait = Math.max(0, 2400 - (performance.now() - started));
    await new Promise((r) => setTimeout(r, wait));
    runningRef.current = false;

    if (!data || data.success === false || !data.result) {
      setErrorMsg(data?.error || 'The analyzer could not read that document. Please try again.');
      setPhase('error');
      return;
    }
    setResult(data.result);
    setMode(data.mode || 'sample');
    setPhase('result');
  }, []);

  const analyzeSample = useCallback(
    (key: string) => {
      setActiveKey(key);
      analyze({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: key }),
      });
    },
    [analyze]
  );

  const analyzeFile = useCallback(
    (file: File) => {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) {
        setErrorMsg('Please choose a PDF file — that is the format the analyzer reads.');
        setPhase('error');
        return;
      }
      if (file.size > MAX_BYTES) {
        setErrorMsg('That PDF is over 10 MB. Please choose a smaller file.');
        setPhase('error');
        return;
      }
      setActiveKey('upload');
      const fd = new FormData();
      fd.append('file', file, file.name);
      analyze({ method: 'POST', body: fd });
    },
    [analyze]
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setResult(null);
    setActiveKey('');
    setShowEngine(false);
    setErrorMsg('');
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) analyzeFile(f);
    },
    [analyzeFile]
  );
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);
  const onPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) analyzeFile(f);
      e.target.value = '';
    },
    [analyzeFile]
  );

  const isLive = mode === 'live';
  const level: RiskLevel = result?.overall_risk.level ?? 'LOW';
  const dashOffset = CIRC * (1 - displayScore / 100);
  const sortedFindings: Finding[] = result
    ? [...result.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity])
    : [];
  const sevCount = (s: Severity) => sortedFindings.filter((f) => f.severity === s).length;

  return (
    <main className="xray-main">
      <div className="mesh-bg xray-noprint" aria-hidden="true">
        <div className="mesh-orb mesh-orb--cyan gpu" />
        <div className="mesh-orb mesh-orb--violet gpu" />
        <div className="mesh-orb mesh-orb--emerald gpu" />
      </div>
      <div className="grid-overlay xray-noprint" aria-hidden="true" />

      <div className="xray-shell">
        {/* ── Header ── */}
        <header className="xray-header xray-noprint">
          <a href="/#work" className="xray-back">
            <span aria-hidden="true">←</span> Back to site
          </a>
          <p className="xray-eyebrow">Live demo · Document intelligence</p>
          <h1 className="xray-title gradient-text">Contract X-Ray</h1>
          <p className="xray-sub">
            Drop in a contract and get a forensic risk read in seconds — every flag tied to the exact
            clause and page it came from.
          </p>
        </header>

        {/* ── IDLE: chooser ── */}
        {phase === 'idle' && (
          <section className="xray-chooser result-pop">
            <div
              className={`xray-drop glass${dragActive ? ' is-drag' : ''}`}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              aria-label="Upload a PDF contract"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="xray-file-input"
                onChange={onPick}
                tabIndex={-1}
              />
              <div className="xray-drop-icon" aria-hidden="true">
                ⇪
              </div>
              <p className="xray-drop-title">Drop a PDF here, or click to browse</p>
              <p className="xray-drop-hint">Contracts, SLAs, NDAs, leases · up to 10 MB · nothing is stored</p>
            </div>

            <div className="xray-or">
              <span>or try a sample</span>
            </div>

            <div className="xray-samples">
              {SAMPLES.map((s) => (
                <button key={s.key} className="xray-sample glass" onClick={() => analyzeSample(s.key)}>
                  <span className="xray-sample-icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="xray-sample-body">
                    <span className="xray-sample-label">{s.label}</span>
                    <span className="xray-sample-type">{s.doc_type}</span>
                    <span className="xray-sample-desc">{s.descriptor}</span>
                  </span>
                  <span className="xray-sample-go" aria-hidden="true">
                    →
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── PROCESSING ── */}
        {phase === 'processing' && (
          <section className="xray-processing glass glass-glow result-pop">
            <div className="scan-bar" aria-hidden="true" />
            <p className="xray-proc-doc">
              Analyzing <strong>{sampleLabel(activeKey)}</strong>
            </p>
            <ul className="xray-steps">
              {STEPS.map((step, i) => {
                const state = i < stepIdx ? 'done' : i === stepIdx ? 'active' : 'wait';
                return (
                  <li key={step.key} className={`xray-step xray-step-${state}`}>
                    <span className="xray-step-icon" aria-hidden="true">
                      {state === 'done' ? '✓' : step.icon}
                    </span>
                    <span className="xray-step-label">{step.label}</span>
                    {state === 'active' && <span className="spinner xray-step-spin" aria-hidden="true" />}
                  </li>
                );
              })}
            </ul>
            <p className="xray-proc-note">Reading the document and scoring every clause…</p>
          </section>
        )}

        {/* ── ERROR ── */}
        {phase === 'error' && (
          <section className="xray-error glass result-pop">
            <div className="xray-error-icon" aria-hidden="true">
              !
            </div>
            <p className="xray-error-msg">{errorMsg}</p>
            <button className="xray-btn xray-btn-primary" onClick={reset}>
              Try again
            </button>
          </section>
        )}

        {/* ── RESULT ── */}
        {phase === 'result' && result && (
          <section className="xray-report" id="xray-report">
            {/* report top bar */}
            <div className="xray-report-bar result-pop">
              <div className="xray-doc-meta">
                <h2 className="xray-doc-title">{result.doc_title}</h2>
                <p className="xray-doc-line">
                  <span>{result.doc_type}</span>
                  <span className="xray-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>{result.page_count} pages</span>
                  <span className="xray-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="xray-mono">{result.record_id}</span>
                </p>
              </div>
              <div className="xray-report-actions xray-noprint">
                <span className={`xray-badge${isLive ? ' xray-badge-live' : ''}`}>
                  {isLive ? '● LIVE (n8n)' : '● SIMULATED'}
                </span>
                <button className="xray-btn xray-btn-ghost" onClick={() => window.print()}>
                  ↧ Download report
                </button>
                <button className="xray-btn xray-btn-ghost" onClick={reset}>
                  Analyze another
                </button>
              </div>
            </div>

            {/* headline: gauge + summary */}
            <div className="xray-headline glass glass-glow result-pop">
              <div className="xray-gauge-wrap">
                <svg className="xray-gauge" viewBox="0 0 130 130" role="img" aria-label={`Risk score ${result.overall_risk.score} of 100`}>
                  <circle className="xray-gauge-track" cx="65" cy="65" r={RADIUS} fill="none" strokeWidth="11" />
                  <circle
                    className="xray-gauge-arc"
                    cx="65"
                    cy="65"
                    r={RADIUS}
                    fill="none"
                    strokeWidth="11"
                    strokeLinecap="round"
                    stroke={LEVEL_STROKE[level]}
                    strokeDasharray={CIRC}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 65 65)"
                  />
                </svg>
                <div className="xray-gauge-center">
                  <span className={`xray-gauge-num counter-value ${LEVEL_TEXT[level]}`}>{displayScore}</span>
                  <span className="xray-gauge-of">/ 100</span>
                </div>
              </div>
              <div className="xray-headline-body">
                <span className={`xray-level-chip ${LEVEL_TEXT[level]}`}>{LEVEL_WORD[level]}</span>
                <p className="xray-headline-text">{result.overall_risk.headline}</p>
                <p className="xray-summary">{result.summary}</p>
                {sortedFindings.length > 0 && (
                  <div className="xray-sev-strip">
                    <span className="xray-sev-tally xray-sev-high">{sevCount('high')} high</span>
                    <span className="xray-sev-tally xray-sev-medium">{sevCount('medium')} medium</span>
                    <span className="xray-sev-tally xray-sev-low">{sevCount('low')} low</span>
                  </div>
                )}
              </div>
            </div>

            {/* findings */}
            {sortedFindings.length > 0 && (
              <div className="xray-section">
                <h3 className="xray-section-title">Findings</h3>
                <div className="xray-findings">
                  {sortedFindings.map((f, i) => (
                    <article
                      key={f.id}
                      className={`xray-finding glass xray-sev-border-${f.severity}${i < visibleFindings ? ' is-visible' : ''}`}
                    >
                      <div className="xray-finding-head">
                        <span className={`xray-sev-chip xray-sev-${f.severity}`}>{SEV_LABEL[f.severity]}</span>
                        <span className="xray-finding-cat">{f.category}</span>
                        {f.page > 0 && <span className="xray-finding-page">📄 p.{f.page}</span>}
                      </div>
                      <h4 className="xray-finding-title">{f.title}</h4>
                      {f.quote && <blockquote className="xray-finding-quote">“{f.quote}”</blockquote>}
                      {f.why && (
                        <p className="xray-finding-line">
                          <span className="xray-finding-tag">Why it matters</span>
                          {f.why}
                        </p>
                      )}
                      {f.recommendation && (
                        <p className="xray-finding-line">
                          <span className="xray-finding-tag xray-finding-tag-fix">Recommended</span>
                          {f.recommendation}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {/* key dates */}
            {result.key_dates.length > 0 && (
              <div className="xray-section">
                <h3 className="xray-section-title">Key dates & deadlines</h3>
                <div className="xray-table glass">
                  {result.key_dates.map((d, i) => (
                    <div key={`${d.label}-${i}`} className="xray-row">
                      <span className={`xray-urg xray-sev-${d.urgency}`} aria-hidden="true" />
                      <span className="xray-row-label">{d.label}</span>
                      <span className="xray-row-value">{d.date}</span>
                      {d.page > 0 && <span className="xray-row-page">p.{d.page}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* parties + key terms */}
            {(result.parties.length > 0 || result.key_terms.length > 0) && (
              <div className="xray-section xray-two">
                {result.parties.length > 0 && (
                  <div className="xray-panel glass">
                    <h3 className="xray-section-title">Parties</h3>
                    <ul className="xray-parties">
                      {result.parties.map((p, i) => (
                        <li key={`${p.name}-${i}`} className="xray-party">
                          <span className="xray-party-name">{p.name}</span>
                          <span className="xray-party-role">{p.role}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.key_terms.length > 0 && (
                  <div className="xray-panel glass">
                    <h3 className="xray-section-title">Key terms</h3>
                    <div className="xray-table xray-table-flush">
                      {result.key_terms.map((t, i) => (
                        <div key={`${t.label}-${i}`} className="xray-row">
                          <span className="xray-row-label">{t.label}</span>
                          <span className="xray-row-value">{t.value}</span>
                          {t.page ? <span className="xray-row-page">p.{t.page}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* mode note (only when not live) */}
            {!isLive && (
              <p className="xray-mode-note xray-noprint">
                {mode === 'mock'
                  ? 'Upload analysis goes live once the n8n engine is connected. Try a sample above for the full forensic X-ray.'
                  : 'This is a pre-scored sample. Connect the n8n engine to X-ray your own PDFs live.'}
              </p>
            )}

            {/* see the engine */}
            <div className="xray-engine-wrap xray-noprint">
              <button className="xray-engine-toggle" onClick={() => setShowEngine((v) => !v)}>
                {showEngine ? '▾ Hide the engine' : '▸ See the engine'}
              </button>
              {showEngine && (
                <div className="xray-engine result-pop">
                  {ENGINE.map((e, i) => (
                    <div key={e.label} className="xray-engine-step">
                      <span className="xray-engine-icon" aria-hidden="true">
                        {e.icon}
                      </span>
                      <span className="xray-engine-label">{e.label}</span>
                      <span className="xray-engine-sub">{e.sub}</span>
                      {i < ENGINE.length - 1 && (
                        <span className="xray-engine-arrow" aria-hidden="true">
                          →
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CTA */}
            <div className="xray-cta glass glass-glow xray-noprint">
              <div>
                <p className="xray-cta-title">Want this reading your contracts?</p>
                <p className="xray-cta-sub">
                  Same engine, your paperwork — wired to your inbox, drive, or Slack.
                </p>
              </div>
              <a href="/#contact" className="xray-btn xray-btn-primary">
                Get this for your business →
              </a>
            </div>

            <p className="xray-footprint">
              Analyzed in {(result.processed_in_ms / 1000).toFixed(1)}s · forensic pass · no document stored
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
