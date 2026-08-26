'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SUGGESTED_QUESTIONS,
  type AssistantMode,
  type AssistantResult,
  type Citation,
} from './config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 3 — GROUNDED KNOWLEDGE ASSISTANT — CLIENT PAGE
   A chat that answers ONLY from Shakibul's knowledge base, cites the
   exact source for every answer, and refuses (no source shown) when a
   question sits outside what it knows. English + Banglish.

   The refusal + the visible source ARE the demo: they prove the
   assistant is grounded, not hallucinating.

   All calls go to the same-origin bridge /api/demo/assistant, which
   decides live-vs-simulated. This page never touches n8n directly
   (CSP `connect-src 'self'`). CSP-safe: no inline styles — colours
   come from classes; the one dynamic width is set via a ref.
   ═══════════════════════════════════════════════════════════════ */

interface Msg {
  id: number;
  role: 'user' | 'bot';
  text?: string; // greeting / simple bot line (no result card)
  result?: AssistantResult;
}

const GREETING =
  '👋 Hi — I’m Shakibul’s assistant. Ask me about services, pricing (local or international), timeline, tech, or how to get started — in English or Banglish. I only answer from what I actually know, and I’ll show you the source.';

const ENGINE = [
  { icon: '💬', label: 'Question in', sub: 'EN / Banglish' },
  { icon: '🔎', label: 'Retrieve', sub: 'match the KB' },
  { icon: '🧠', label: 'Grounded LLM', sub: 'answer from context' },
  { icon: '📎', label: 'Cite source', sub: 'every claim' },
  { icon: '🛡️', label: 'Refuse', sub: 'if not found' },
];

const ERROR_RESULT: AssistantResult = {
  answer:
    'Sorry — I couldn’t reach the assistant just now. Please try that again in a moment.',
  citations: [],
  confidence: 0,
  out_of_scope: true,
  suggested_followups: ['What can you build for my business?', 'How do we get started?'],
  record_id: '—',
  processed_in_ms: 0,
};

/* Reveal answer text like it is being typed; snaps to full when a newer
   answer arrives, or immediately if the visitor prefers reduced motion. */
function Typewriter({ text, animate }: { text: string; animate: boolean }) {
  const [n, setN] = useState(animate ? 0 : text.length);
  useEffect(() => {
    if (!animate) {
      setN(text.length);
      return;
    }
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setN(text.length);
      return;
    }
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setN(Math.min(i, text.length));
      if (i >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text, animate]);
  const typing = n < text.length;
  return (
    <>
      {text.slice(0, n)}
      {typing && (
        <span className="asst-caret" aria-hidden="true">
          ▍
        </span>
      )}
    </>
  );
}

/* Slim confidence bar — width set through a ref (no inline style attr). */
function ConfBar({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  useEffect(() => {
    if (ref.current) ref.current.style.width = `${pct}%`;
  }, [pct]);
  return (
    <div className="asst-conf" title="How well this question matched the knowledge base">
      <span className="asst-conf-label">Match</span>
      <span className="asst-conf-track">
        <span className="asst-conf-fill" ref={ref} />
      </span>
      <span className="asst-conf-val">{pct}%</span>
    </div>
  );
}

/* The signature element: the cited source, expandable to the verbatim
   knowledge-base text the answer was grounded in. */
function CitationChip({ c }: { c: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`asst-cite${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="asst-cite-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="asst-cite-icon" aria-hidden="true">
          📎
        </span>
        <span className="asst-cite-title">Source · {c.section}</span>
        <span className="asst-cite-chev" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <blockquote className="asst-cite-body result-pop">“{c.snippet}”</blockquote>
      )}
    </div>
  );
}

export default function AssistantDemo() {
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: 'bot', text: GREETING }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AssistantMode>('sample');
  const [showEngine, setShowEngine] = useState(false);

  const idRef = useRef(1);
  const threadRef = useRef<HTMLDivElement>(null);
  const runningRef = useRef(false);

  const nextId = () => idRef.current++;

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || runningRef.current) return;
    runningRef.current = true;

    setMessages((m) => [...m, { id: nextId(), role: 'user', text: q }]);
    setInput('');
    setLoading(true);

    const started = performance.now();
    let data: {
      success?: boolean;
      mode?: AssistantMode;
      result?: AssistantResult;
    } | null = null;
    try {
      const res = await fetch('/api/demo/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      data = await res.json();
    } catch {
      data = null;
    }

    // A short beat so the "searching" state is legible even when instant.
    const wait = Math.max(0, 720 - (performance.now() - started));
    await new Promise((r) => setTimeout(r, wait));

    setLoading(false);
    runningRef.current = false;

    if (!data || data.success === false || !data.result) {
      setMessages((m) => [...m, { id: nextId(), role: 'bot', result: ERROR_RESULT }]);
      return;
    }
    setMode(data.mode || 'mock');
    setMessages((m) => [...m, { id: nextId(), role: 'bot', result: data!.result }]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(input);
  }

  const isLive = mode === 'live';
  // id of the most recent bot message — only that one types out.
  let lastBotId = -1;
  for (const m of messages) if (m.role === 'bot') lastBotId = m.id;

  return (
    <main className="asst-main">
      <div className="mesh-bg" aria-hidden="true">
        <div className="mesh-orb mesh-orb--emerald gpu" />
        <div className="mesh-orb mesh-orb--cyan gpu" />
        <div className="mesh-orb mesh-orb--violet gpu" />
      </div>
      <div className="grid-overlay" aria-hidden="true" />

      <div className="asst-shell">
        {/* ── Header ── */}
        <header className="asst-header">
          <a href="/#work" className="asst-back">
            <span aria-hidden="true">←</span> Back to site
          </a>
          <p className="asst-eyebrow">Live demo · Grounded assistant</p>
          <h1 className="asst-title gradient-text">Grounded Assistant</h1>
          <p className="asst-sub">
            Ask about Shakibul’s services in English or Banglish. Every answer is tied to a
            source — and when a question falls outside what it knows, it says so instead of
            guessing.
          </p>
        </header>

        {/* ── Chat panel ── */}
        <section className="asst-panel glass glass-glow">
          <div className="asst-panel-bar">
            <div className="asst-panel-id">
              <span className="glow-dot glow-dot--sm" />
              <span className="asst-panel-name">Services Assistant</span>
            </div>
            <span className={`asst-badge${isLive ? ' asst-badge-live' : ''}`}>
              {isLive ? '● LIVE (n8n)' : '● SIMULATED'}
            </span>
          </div>

          <div className="asst-thread" ref={threadRef}>
            {messages.map((m) => {
              if (m.role === 'user') {
                return (
                  <div key={m.id} className="asst-msg asst-msg-user result-pop">
                    <div className="asst-bubble-user">{m.text}</div>
                  </div>
                );
              }
              // greeting / simple bot line
              if (m.text) {
                return (
                  <div key={m.id} className="asst-msg asst-msg-bot result-pop">
                    <div className="asst-answer asst-answer-plain">
                      <p className="asst-answer-text">{m.text}</p>
                    </div>
                  </div>
                );
              }
              const r = m.result!;
              const refuse = r.out_of_scope;
              const animate = m.id === lastBotId;
              return (
                <div key={m.id} className="asst-msg asst-msg-bot result-pop">
                  <div className={`asst-answer${refuse ? ' asst-answer-refuse' : ''}`}>
                    {refuse ? (
                      <span className="asst-refuse-tag">
                        <span aria-hidden="true">◇</span> Outside my knowledge base
                      </span>
                    ) : (
                      <span className="asst-grounded-tag">
                        <span aria-hidden="true">✓</span> Grounded answer
                      </span>
                    )}

                    <p className="asst-answer-text">
                      <Typewriter text={r.answer} animate={animate} />
                    </p>

                    {!refuse && <ConfBar value={r.confidence} />}

                    {refuse ? (
                      <p className="asst-nosrc">
                        No matching source in the knowledge base — so I won’t guess.
                      </p>
                    ) : (
                      r.citations.length > 0 && (
                        <div className="asst-cites">
                          {r.citations.map((c, i) => (
                            <CitationChip key={`${c.section_id}-${i}`} c={c} />
                          ))}
                        </div>
                      )
                    )}

                    {r.cta && (
                      <a className="asst-answer-cta btn-shine" href={r.cta.href}>
                        {r.cta.label}
                        <span aria-hidden="true"> →</span>
                      </a>
                    )}

                    {r.suggested_followups.length > 0 && (
                      <div className="asst-followups">
                        <span className="asst-followups-label">Ask next</span>
                        <div className="asst-followup-row">
                          {r.suggested_followups.map((f) => (
                            <button
                              key={f}
                              type="button"
                              className="asst-followup"
                              onClick={() => ask(f)}
                              disabled={loading}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="asst-msg asst-msg-bot result-pop">
                <div className="asst-answer asst-answer-typing">
                  <span className="asst-typing-label">Searching the knowledge base</span>
                  <span className="asst-typing-dots" aria-hidden="true">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Suggested starter questions */}
          <div className="asst-suggest">
            <span className="asst-suggest-label">Try asking</span>
            <div className="asst-chips">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="asst-chip"
                  onClick={() => ask(q)}
                  disabled={loading}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Input */}
          <form className="asst-input-bar" onSubmit={onSubmit}>
            <input
              className="asst-input"
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask in English or Banglish…"
              aria-label="Ask the assistant a question"
              maxLength={500}
              autoComplete="off"
            />
            <button
              className="asst-send"
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send question"
            >
              <span aria-hidden="true">➤</span>
            </button>
          </form>
        </section>

        {/* See the engine */}
        <div className="asst-engine-wrap">
          <button
            type="button"
            className="asst-engine-toggle"
            onClick={() => setShowEngine((v) => !v)}
            aria-expanded={showEngine}
          >
            {showEngine ? '▾ Hide the engine' : '▸ See the engine'}
          </button>
          {showEngine && (
            <div className="asst-engine result-pop">
              {ENGINE.map((e, i) => (
                <div key={e.label} className="asst-engine-step">
                  <span className="asst-engine-icon" aria-hidden="true">
                    {e.icon}
                  </span>
                  <span className="asst-engine-label">{e.label}</span>
                  <span className="asst-engine-sub">{e.sub}</span>
                  {i < ENGINE.length - 1 && (
                    <span className="asst-engine-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="asst-engine-note">
            Answers are limited to Shakibul’s services. Nothing is invented — no source, no
            claim.
          </p>
        </div>

        {/* CTA */}
        <div className="asst-cta glass glass-glow">
          <div>
            <p className="asst-cta-title">Want a grounded assistant for your business?</p>
            <p className="asst-cta-sub">
              Same engine, your knowledge — answering customers 24/7 in your voice, never
              making things up.
            </p>
          </div>
          <a href="/#contact" className="asst-btn asst-btn-primary btn-shine">
            Get this for your business →
          </a>
        </div>
      </div>
    </main>
  );
}
