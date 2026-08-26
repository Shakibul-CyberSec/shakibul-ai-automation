'use client';

import { useEffect, useRef, useState } from 'react';
import {
  INDUSTRIES,
  INDUSTRY_LIST,
  type Accent,
  type IntakeResult,
  type Tier,
} from './config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 1 — LIVE INTAKE ENGINE (presentation layer)
   The prospect never sees n8n. They see this. The engine runs
   invisibly behind /api/demo/intake.
   ═══════════════════════════════════════════════════════════════ */

const STEPS = [
  { key: 'receive', label: 'Receiving submission', icon: '📥' },
  { key: 'analyze', label: 'AI analyzing intent', icon: '🧠' },
  { key: 'score', label: 'Scoring & qualifying', icon: '🎯' },
  { key: 'route', label: 'Routing decision', icon: '🔀' },
  { key: 'sync', label: 'Syncing to database', icon: '🗄️' },
  { key: 'notify', label: 'Dispatching alert', icon: '🔔' },
];

const ACCENT: Record<Accent, { text: string; grad: string; dot: string; soft: string; border: string; stroke: string }> = {
  cyan:    { text: 'text-cyan-400',    grad: 'from-cyan-400 to-cyan-600',       dot: 'bg-cyan-400',    soft: 'bg-cyan-500/10',    border: 'border-cyan-400/40',    stroke: '#06d6f2' },
  emerald: { text: 'text-emerald-400', grad: 'from-emerald-400 to-emerald-600', dot: 'bg-emerald-400', soft: 'bg-emerald-500/10', border: 'border-emerald-400/40', stroke: '#10b981' },
  violet:  { text: 'text-violet-400',  grad: 'from-violet-400 to-violet-600',   dot: 'bg-violet-400',  soft: 'bg-violet-500/10',  border: 'border-violet-400/40',  stroke: '#8b5cf6' },
  rose:    { text: 'text-rose-400',    grad: 'from-rose-400 to-rose-600',       dot: 'bg-rose-400',    soft: 'bg-rose-500/10',    border: 'border-rose-400/40',    stroke: '#f43f5e' },
};

const TIER_BADGE: Record<Tier, string> = {
  HOT:  'bg-rose-500/15 text-rose-300 border-rose-500/40',
  WARM: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  COLD: 'bg-sky-500/15 text-sky-300 border-sky-500/40',
};

const RADIUS = 52;
const CIRC = 2 * Math.PI * RADIUS;

type Phase = 'idle' | 'processing' | 'result' | 'error';

export default function IntakeDemo() {
  const [industryId, setIndustryId] = useState('fcommerce');
  const [form, setForm] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [mode, setMode] = useState<'live' | 'mock'>('mock');
  const [displayScore, setDisplayScore] = useState(0);
  const [dashOffset, setDashOffset] = useState(CIRC);
  const [visibleTags, setVisibleTags] = useState(0);
  const [notifVisible, setNotifVisible] = useState(false);
  const [showEngine, setShowEngine] = useState(false);

  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const cfg = INDUSTRIES[industryId];
  const accent = ACCENT[cfg.accent];

  // Reset everything when the industry changes
  function selectIndustry(id: string) {
    if (stepTimer.current) clearInterval(stepTimer.current);
    setIndustryId(id);
    setForm({});
    setPhase('idle');
    setResult(null);
    setCurrentStep(0);
    setVisibleTags(0);
    setNotifVisible(false);
  }

  function fillSample() {
    setForm(INDUSTRIES[industryId].sampleData);
  }

  function reset() {
    if (stepTimer.current) clearInterval(stepTimer.current);
    setPhase('idle');
    setResult(null);
    setCurrentStep(0);
    setVisibleTags(0);
    setNotifVisible(false);
    setDisplayScore(0);
    setDashOffset(CIRC);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase('processing');
    setResult(null);
    setCurrentStep(0);
    setVisibleTags(0);
    setNotifVisible(false);
    setDisplayScore(0);
    setDashOffset(CIRC);

    // Step ticker — feels like real pipeline stages firing
    let step = 0;
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => {
      step += 1;
      setCurrentStep(step);
      if (step >= STEPS.length && stepTimer.current) clearInterval(stepTimer.current);
    }, 340);

    const started = Date.now();
    let data: { success: boolean; mode: 'live' | 'mock'; result: IntakeResult } | null = null;
    try {
      const res = await fetch('/api/demo/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry: industryId, submission: form }),
      });
      data = await res.json();
    } catch {
      data = null;
    }

    // Guarantee the animation gets its full runtime
    const elapsed = Date.now() - started;
    await new Promise((r) => setTimeout(r, Math.max(0, 2300 - elapsed)));
    if (stepTimer.current) clearInterval(stepTimer.current);
    setCurrentStep(STEPS.length);

    if (!data || !data.success) {
      setPhase('error');
      return;
    }
    setResult(data.result);
    setMode(data.mode);
    setPhase('result');
  }

  // Animate gauge + score + tags + notification once a result lands
  useEffect(() => {
    if (phase !== 'result' || !result) return;
    const dur = 1200;
    const start = performance.now();
    let raf = 0;
    const animate = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayScore(Math.round(eased * result.score));
      setDashOffset(CIRC * (1 - (eased * result.score) / 100));
      if (p < 1) raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);

    const tagTimers = result.tags.map((_, i) =>
      setTimeout(() => setVisibleTags((v) => Math.max(v, i + 1)), 900 + i * 170)
    );
    const notifTimer = setTimeout(() => setNotifVisible(true), 1500);

    return () => {
      cancelAnimationFrame(raf);
      tagTimers.forEach(clearTimeout);
      clearTimeout(notifTimer);
    };
  }, [phase, result]);

  useEffect(() => () => { if (stepTimer.current) clearInterval(stepTimer.current); }, []);

  return (
    <div className="relative min-h-screen">
      <div className="mesh-bg">
        <div className="mesh-orb mesh-orb--cyan gpu" />
        <div className="mesh-orb mesh-orb--violet gpu" />
        <div className="mesh-orb mesh-orb--emerald gpu" />
      </div>
      <div className="grid-overlay" />

      {/* ── Top bar ── */}
      <header className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors text-sm font-medium">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" /></svg>
          <span>Back to site</span>
        </a>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/25 text-cyan-300 text-xs font-mono tracking-wider backdrop-blur-md">
          <span className="glow-dot glow-dot--sm" />
          <span>LIVE INTERACTIVE DEMO</span>
        </div>
      </header>

      {/* ── Title ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-8 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-black text-white mb-4">
          Live <span className="gradient-text">Intake Engine</span>
        </h1>
        <p className="text-slate-300 max-w-2xl mx-auto text-sm leading-relaxed">
          Submit an inquiry and watch the AI qualify, score, route, log and alert — in real time.
          Pick an industry to see the same engine adapt.
        </p>
      </section>

      {/* ── Industry selector ── */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 mb-8">
        <div className="flex flex-wrap justify-center gap-2.5">
          {INDUSTRY_LIST.map((ind) => {
            const active = ind.id === industryId;
            const a = ACCENT[ind.accent];
            return (
              <button
                key={ind.id}
                type="button"
                onClick={() => selectIndustry(ind.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all duration-300 flex items-center gap-2 ${
                  active
                    ? `glass ${a.border} ${a.text}`
                    : 'border-white/[0.06] text-slate-400 hover:text-slate-200 hover:border-white/20'
                }`}
              >
                <span>{ind.icon}</span>
                <span>{ind.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main split: form | engine ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT — the intake form */}
        <div className="glass p-7 rounded-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">{cfg.icon}</span>
                <h2 className="text-lg font-bold text-white">{cfg.formTitle}</h2>
              </div>
              <p className="text-xs text-slate-400">{cfg.tagline}</p>
            </div>
            <button
              type="button"
              onClick={fillSample}
              className="text-xs font-mono px-3 py-1.5 rounded-lg border border-white/10 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300 transition-all"
            >
              ✨ Fill sample
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cfg.fields.map((field) => (
              <div key={field.name} className={field.full || field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">{field.label}</label>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={3}
                    placeholder={field.placeholder}
                    value={form[field.name] || ''}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="input-field resize-none"
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={form[field.name] || ''}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="input-field bg-slate-900/90 text-slate-200 cursor-pointer"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={form[field.name] || ''}
                    onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}
                    className="input-field"
                  />
                )}
              </div>
            ))}

            <div className="sm:col-span-2 flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={phase === 'processing'}
                className={`btn-shine flex-1 py-3.5 rounded-xl bg-gradient-to-r ${accent.grad} text-black font-bold text-sm shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
              >
                {phase === 'processing' ? 'Processing…' : 'Submit Inquiry'}
                {phase !== 'processing' && (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                )}
              </button>
              {phase !== 'idle' && (
                <button type="button" onClick={reset} className="px-4 py-3.5 rounded-xl border border-white/10 text-slate-300 text-sm hover:border-white/25 transition-all">
                  Reset
                </button>
              )}
            </div>
          </form>
        </div>

        {/* RIGHT — the AI engine */}
        <div className="glass-glow p-7 rounded-3xl relative overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
              AI Intake Engine
            </h2>
            {phase === 'result' && (
              <span className={`text-[10px] font-mono px-2 py-1 rounded-md border ${mode === 'live' ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' : 'text-slate-400 border-white/10'}`}>
                {mode === 'live' ? '● LIVE (n8n)' : '● SIMULATED'}
              </span>
            )}
          </div>

          {/* IDLE */}
          {phase === 'idle' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16 gap-4">
              <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center text-3xl">⚡</div>
              <p className="text-slate-400 text-sm max-w-xs">Fill the form and hit submit. The engine will qualify and route the lead live — in about 3 seconds.</p>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {cfg.scoreDimensions.map((d) => (
                  <span key={d} className="text-[11px] font-mono px-2.5 py-1 rounded-full border border-white/[0.06] text-slate-500">{d}</span>
                ))}
              </div>
            </div>
          )}

          {/* PROCESSING */}
          {phase === 'processing' && (
            <div className="flex-1 py-4">
              <div className="scan-bar mb-6" />
              <div className="space-y-2.5">
                {STEPS.map((s, i) => {
                  const done = i < currentStep;
                  const active = i === currentStep;
                  return (
                    <div key={s.key} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-300 ${done ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : active ? `${accent.border} ${accent.soft}` : 'border-white/[0.04] opacity-40'}`}>
                      <span className="text-lg">{s.icon}</span>
                      <span className={`text-sm flex-1 ${done || active ? 'text-white' : 'text-slate-500'}`}>{s.label}</span>
                      {done ? (
                        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      ) : active ? (
                        <span className="spinner" />
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RESULT */}
          {phase === 'result' && result && (
            <div className="flex-1 result-pop">
              <div className="flex items-center gap-6">
                {/* Gauge */}
                <div className="relative shrink-0">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r={RADIUS} fill="none"
                      stroke={accent.stroke} strokeWidth="10" strokeLinecap="round"
                      strokeDasharray={CIRC} strokeDashoffset={dashOffset}
                      transform="rotate(-90 60 60)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-black font-mono counter-value ${accent.text}`}>{displayScore}</span>
                    <span className="text-[10px] text-slate-500 font-mono">/ 100</span>
                  </div>
                </div>

                {/* Tier + summary */}
                <div className="flex-1 min-w-0">
                  <span className={`inline-block text-xs font-black font-mono px-3 py-1 rounded-full border mb-2 ${TIER_BADGE[result.tier]}`}>
                    {result.tier} LEAD
                  </span>
                  <p className="text-sm text-white leading-snug mb-1">{result.summary}</p>
                  <p className="text-xs text-slate-500 leading-snug">{result.reasoning}</p>
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-5">
                {result.tags.map((tag, i) => (
                  <span key={tag} className={`chip-in text-[11px] font-mono px-2.5 py-1 rounded-full border ${accent.border} ${accent.text} ${i < visibleTags ? 'chip-visible' : ''}`}>
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Routed + action */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                <div className="p-4 rounded-2xl bg-[#030712]/60 border border-white/[0.06]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">Routed to</div>
                  <div className="text-sm font-semibold text-white">{result.routed_to}</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#030712]/60 border border-white/[0.06]">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 font-mono mb-1">Recommended action</div>
                  <div className="text-sm font-semibold text-white">{result.recommended_action}</div>
                </div>
              </div>

              <div className="mt-4 text-center text-[11px] text-slate-500 font-mono">
                Processed in {(result.processed_in_ms / 1000).toFixed(1)}s · record {result.record_id}
              </div>
            </div>
          )}

          {/* ERROR */}
          {phase === 'error' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16 gap-3">
              <span className="text-3xl">⚠️</span>
              <p className="text-slate-300 text-sm">Something went wrong. Try again.</p>
              <button type="button" onClick={reset} className="text-cyan-400 text-sm hover:underline">Reset</button>
            </div>
          )}
        </div>
      </section>

      {/* ── Downstream: CRM sync + phone alert (after result) ── */}
      {phase === 'result' && result && (
        <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pb-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* CRM / Sheet row inserted */}
          <div className="glass p-6 rounded-3xl row-slide">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span>🗄️</span> Synced to CRM / Google Sheet
              <span className="text-[10px] text-emerald-400 font-mono ml-auto">+1 row</span>
            </h3>
            <div className="overflow-hidden rounded-xl border border-white/[0.06]">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/[0.03] text-slate-400 font-mono">
                  <tr>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Tier</th>
                    <th className="px-3 py-2 font-medium">Routed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-white/[0.06] bg-emerald-500/[0.04]">
                    <td className="px-3 py-2.5 text-white">{form.name || form.company || '—'}</td>
                    <td className={`px-3 py-2.5 font-mono font-bold ${accent.text}`}>{result.score}</td>
                    <td className="px-3 py-2.5">{result.tier}</td>
                    <td className="px-3 py-2.5 text-slate-300">{result.routed_to}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 font-mono">Zero duplicates · structured fields · 2-way sync ready</p>
          </div>

          {/* Phone notification */}
          <div className="glass p-6 rounded-3xl">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <span>🔔</span> Instant team alert
              <span className="text-[10px] text-slate-400 font-mono ml-auto">via {result.notification_channel}</span>
            </h3>
            <div className="mx-auto max-w-xs bg-[#0b141a] rounded-[1.75rem] border-4 border-[#1f2937] p-3 shadow-2xl">
              <div className="flex items-center gap-2 px-2 py-2 border-b border-white/[0.06] mb-3">
                <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${accent.grad} flex items-center justify-center text-sm`}>{cfg.icon}</div>
                <div>
                  <div className="text-xs font-semibold text-white">{cfg.label} Alerts</div>
                  <div className="text-[10px] text-emerald-400">online</div>
                </div>
              </div>
              {notifVisible ? (
                <div className="bubble-in bg-emerald-900/40 border border-emerald-500/20 rounded-2xl rounded-tl-sm px-3 py-2.5 mb-2">
                  {result.notification_message.split('\n').map((line, i) => (
                    <div key={i} className={`text-xs leading-relaxed ${i === 0 ? 'font-bold text-white' : 'text-slate-200'}`}>{line}</div>
                  ))}
                  <div className="text-[9px] text-slate-500 text-right mt-1 font-mono">now ✓✓</div>
                </div>
              ) : (
                <div className="flex items-center gap-1 px-3 py-3">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── "See the engine" reveal (for technical prospects) ── */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pb-16">
        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowEngine((s) => !s)}
            className="text-xs font-mono text-slate-400 hover:text-cyan-300 transition-colors inline-flex items-center gap-2"
          >
            <svg className={`w-4 h-4 transition-transform ${showEngine ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            {showEngine ? 'Hide the engine' : 'See the engine under the hood'}
          </button>
        </div>

        {showEngine && (
          <div className="glass mt-6 p-7 rounded-3xl result-pop">
            <p className="text-xs text-slate-400 text-center mb-6 max-w-2xl mx-auto">
              The prospect only sees the experience above. Behind it, a secured pipeline runs on your own infrastructure —
              your data never touches a third-party server.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {[
                { icon: '🌐', label: 'Web form' },
                { icon: '🔒', label: 'API bridge' },
                { icon: '🧠', label: 'AI scoring' },
                { icon: '🔀', label: 'Router' },
                { icon: '🗄️', label: 'Sheet / CRM' },
                { icon: '🔔', label: 'Alert' },
              ].map((node, i, arr) => (
                <div key={node.label} className="flex items-center gap-2">
                  <div className="px-4 py-3 rounded-xl bg-[#030712]/70 border border-white/[0.08] text-center min-w-[90px]">
                    <div className="text-xl mb-1">{node.icon}</div>
                    <div className="text-[11px] text-slate-300 font-mono">{node.label}</div>
                  </div>
                  {i < arr.length - 1 && (
                    <svg className="w-4 h-4 text-cyan-500/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 font-mono">
              <span className="text-cyan-400">🛡️ Data stays in your accounts</span>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <span>Encrypted credentials</span>
              <span className="text-slate-700 hidden sm:inline">|</span>
              <span className="text-emerald-400">Open-source model option</span>
            </div>
          </div>
        )}
      </section>

      {/* ── CTA ── */}
      <section className="relative z-10 max-w-3xl mx-auto px-6 lg:px-8 pb-24 text-center">
        <div className="glass-glow p-10 rounded-3xl">
          <h2 className="text-2xl font-black text-white mb-3">Want this wired into <span className="gradient-text">your</span> inbox?</h2>
          <p className="text-slate-300 text-sm mb-6 max-w-lg mx-auto">
            This exact engine can be configured for your business in days — your tools, your data, your rules.
          </p>
          <a href="/#contact" className="btn-shine inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-black font-bold text-sm shadow-lg">
            Book a 30-min build call
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
        </div>
      </section>
    </div>
  );
}
