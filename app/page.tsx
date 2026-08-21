'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Script from 'next/script';

/* ═══════════════════════════════════════════════════════
   SCROLL REVEAL HOOK — Progressive Intersection Observer
   Smooth, staggered, GPU-composited reveals
   ═══════════════════════════════════════════════════════ */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const parent = entry.target.parentElement;
            if (parent) {
              const siblings = Array.from(
                parent.querySelectorAll(':scope > .reveal, :scope > .reveal-left, :scope > .reveal-right, :scope > .reveal-scale')
              );
              const idx = siblings.indexOf(entry.target as Element);
              if (idx > 0) {
                (entry.target as HTMLElement).style.transitionDelay = `${idx * 120}ms`;
              }
            }
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
    );

    const targets = el.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale');
    targets.forEach((t) => observer.observe(t));
    if (
      el.classList.contains('reveal') ||
      el.classList.contains('reveal-scale') ||
      el.classList.contains('reveal-left') ||
      el.classList.contains('reveal-right')
    ) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ═══════════════════════════════════════════════════════
   ANIMATED COUNTER HOOK
   ═══════════════════════════════════════════════════════ */
function useCounter(end: number, duration: number = 1500, startOnVisible: boolean = true) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnVisible) { setStarted(true); return; }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setStarted(true); obs.disconnect(); } },
      { threshold: 0.5 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!started) return;
    let frame: number;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * end));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [started, end, duration]);

  return { count, ref };
}

/* ═══════════════════════════════════════════════════════
   3D TILT CARD HOOK — Mouse-tracked tilt
   ═══════════════════════════════════════════════════════ */
function useTilt3D(intensity: number = 8) {
  const ref = useRef<HTMLDivElement>(null);
  const rafId = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (rafId.current !== null) return;
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(1000px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateY(-4px) scale(1.02)`;
    });
  }, [intensity]);

  const handleMouseLeave = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1000px) rotateY(0deg) rotateX(0deg) translateY(0) scale(1)';
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    el.addEventListener('mousemove', handleMouseMove, { passive: true });
    el.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    return () => {
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return ref;
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function Home() {
  const heroRef = useScrollReveal();
  const pipelineRef = useScrollReveal();
  const solutionsRef = useScrollReveal();
  const workRef = useScrollReveal();
  const calcRef = useScrollReveal();
  const securityRef = useScrollReveal();
  const contactRef = useScrollReveal();

  const tiltCalc = useTilt3D(4);

  // Estimate calculator — illustrative, not a claimed/proven result
  const [team, setTeam] = useState(5);
  const [hours, setHours] = useState(15);
  const [rate, setRate] = useState(35);
  const yearlyGross = team * hours * 52 * rate;
  const yearly = Math.round(yearlyGross * 0.80);
  const monthly = Math.round(team * hours * 4.33 * 0.80);

  // Counters — real, verifiable commitments and metrics
  const counter1 = useCounter(100, 2000); // % Data Stays In Your Own Accounts
  const counter2 = useCounter(24, 1600);  // Hours To First Working Prototype
  const counter3 = useCounter(100, 2000); // % Workflow & Code Ownership
  const counter4 = useCounter(2, 1400);   // Hour Response Guarantee

  // Contact Form State
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [turnstileLoaded, setTurnstileLoaded] = useState(false);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    message: '',
    bot_trap_secondary: '',
    company_fax_number: '',
    honey_company_url: ''
  });

  useEffect(() => {
    if (turnstileLoaded && typeof window !== 'undefined' && (window as any).turnstile && turnstileRef.current && !turnstileWidgetId.current) {
      try {
        turnstileWidgetId.current = (window as any).turnstile.render(turnstileRef.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAACWGsNxWiViu_VmW',
          callback: (token: string) => setCaptchaToken(token),
          'error-callback': () => setCaptchaToken(null),
          'expired-callback': () => setCaptchaToken(null),
          theme: 'dark',
          size: 'normal',
        });
      } catch (e) {
        console.error('Turnstile render error:', e);
      }
    }
  }, [turnstileLoaded]);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/SendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, captchaToken })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSubmitted(true);
      } else {
        setErrorMsg(data.error || 'Failed to submit request. Please try again.');
      }
    } catch (err) {
      setErrorMsg('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Navbar scroll effect
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <div className="relative min-h-screen">

      {/* ── Mesh Gradient Background ── */}
      <div className="mesh-bg">
        <div className="mesh-orb mesh-orb--cyan gpu" />
        <div className="mesh-orb mesh-orb--violet gpu" />
        <div className="mesh-orb mesh-orb--emerald gpu" />
      </div>
      <div className="grid-overlay" />

      {/* ── CSS Particles (zero inline styles — CSP safe) ── */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={`particle particle--${i}`} />
      ))}

      {/* ═══════════ NAVIGATION ═══════════ */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-[#030712]/85 backdrop-blur-2xl border-b border-white/[0.06] shadow-lg shadow-black/30'
          : 'bg-transparent'
      }`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-20 flex items-center justify-between">
          <a href="#hero" className="flex items-center gap-3 group">
            <div className="relative w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 p-[2px] shadow-lg shadow-cyan-500/20 group-hover:shadow-cyan-500/40 transition-shadow duration-500">
              <div className="w-full h-full bg-[#030712] rounded-[10px] flex items-center justify-center">
                <svg className="w-5 h-5 text-cyan-400 group-hover:rotate-12 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg text-white tracking-wide block leading-tight">
                SHAKIBUL<span className="text-cyan-400"> BOKHTIAR</span>
              </span>
              <span className="text-[10px] text-slate-500 tracking-[0.2em] font-mono uppercase">AI Workflow & Systems Developer</span>
            </div>
          </a>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-400">
            {[
              { label: 'Capabilities', id: 'solutions' },
              { label: 'Process', id: 'architecture' },
              { label: 'Prototypes', id: 'work' },
              { label: 'Estimate', id: 'roi' },
              { label: 'Privacy', id: 'security' },
              { label: 'Contact', id: 'contact' },
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="relative py-1 hover:text-white transition-colors duration-300 group"
              >
                {item.label}
                <span className="absolute bottom-0 left-0 w-0 h-[2px] bg-gradient-to-r from-cyan-400 to-emerald-400 group-hover:w-full transition-all duration-400" />
              </a>
            ))}
          </div>

          <a
            href="#contact"
            className="btn-shine px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-500 text-black font-bold text-sm shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40 hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-2"
          >
            <span>Get In Touch</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
        </div>
      </nav>

      {/* ═══════════ HERO ═══════════ */}
      <section id="hero" className="relative z-10 pt-40 pb-28 px-6 lg:px-8 max-w-7xl mx-auto text-center" ref={heroRef}>

        {/* Status badge */}
        <div className="hero-text-reveal inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-cyan-950/40 border border-cyan-500/20 text-cyan-300 text-xs font-mono tracking-wider mb-10 backdrop-blur-md">
          <span className="glow-dot glow-dot--sm" />
          <span>CUSTOM AI AUTOMATION & WORKFLOW SYSTEMS</span>
        </div>

        {/* Main headline */}
        <h1 className="hero-text-reveal text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white max-w-5xl mx-auto leading-[1.08] mb-8">
          I Automate Your{' '}
          <span className="gradient-text">Repetitive Workflows</span>
          <br className="hidden sm:block" />
          {' '}With Smart, Secure{' '}
          <span className="gradient-text-violet">AI Pipelines</span>
        </h1>

        {/* Subtext */}
        <p className="hero-text-reveal text-lg sm:text-xl text-slate-300 max-w-3xl mx-auto leading-relaxed mb-10">
          I&apos;m Shakibul — an independent automation developer. I build custom, reliable workflow automations that connect your everyday tools, data, and business operations with AI — eliminating repetitive manual busywork while keeping your information private and secure.
        </p>

        {/* Supported Tech Stack Pills */}
        <div className="hero-text-reveal flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto mb-14 font-mono text-xs text-slate-300">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/20 backdrop-blur-md">
            <span className="text-cyan-400 font-bold">⚙️ Tools:</span>
            <span>n8n • Make • Python • Webhooks</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-violet-500/20 backdrop-blur-md">
            <span className="text-violet-400 font-bold">🧠 AI:</span>
            <span>OpenAI • Claude • Custom Prompts</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/20 backdrop-blur-md">
            <span className="text-emerald-400 font-bold">🔌 Connectors:</span>
            <span>CRMs • Google Sheets • Airtable • APIs</span>
          </div>
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/20 backdrop-blur-md">
            <span className="text-cyan-400 font-bold">🛡️ Data Privacy:</span>
            <span>100% In Your Accounts • Encrypted</span>
          </div>
        </div>

        {/* CTA row */}
        <div className="hero-text-reveal flex flex-col sm:flex-row items-center justify-center gap-4 mb-20">
          <a
            href="#work"
            className="btn-shine group px-10 py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 bg-[length:200%_auto] hover:bg-right transition-all duration-700 text-black font-bold text-base shadow-2xl shadow-cyan-500/25 hover:scale-105 active:scale-95 flex items-center gap-3"
          >
            <span>See Working Demos</span>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
          </a>
          <a
            href="#architecture"
            className="px-10 py-4 rounded-2xl glass text-white font-semibold text-base hover:border-cyan-500/30 transition-all duration-500 flex items-center gap-2 group"
          >
            <span>How It Works</span>
            <svg className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
          </a>
        </div>

        {/* Trust metrics — real, verifiable commitments */}
        <div className="hero-text-reveal grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {[
            { ref: counter1, label: 'Data In Your Accounts', suffix: '%', color: 'text-cyan-400' },
            { ref: counter2, label: 'Hours To First Prototype', suffix: 'h', color: 'text-emerald-400' },
            { ref: counter3, label: 'Client Code Ownership', suffix: '%', color: 'text-violet-400' },
            { ref: counter4, label: 'Hour Response Guarantee', suffix: 'h', color: 'text-white' },
          ].map((metric, i) => (
            <div key={i} ref={metric.ref.ref} className="glass p-5 rounded-2xl text-center group hover:border-cyan-500/20 transition-all duration-500">
              <div className={`text-3xl font-black font-mono counter-value ${metric.color}`}>
                {metric.ref.count}{metric.suffix}
              </div>
              <div className="text-xs text-slate-500 mt-1.5 font-medium">{metric.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Glowing divider */}
      <div className="glow-line max-w-4xl mx-auto" />

      {/* ═══════════ 4-STEP PROCESS ═══════════ */}
      <section id="architecture" className="relative z-10 py-24 px-6 lg:px-8 max-w-7xl mx-auto" ref={pipelineRef}>
        <div className="text-center mb-16 reveal">
          <p className="text-violet-400 font-mono text-xs font-bold uppercase tracking-[0.25em] mb-3">● How I Work</p>
          <h2 className="text-3xl sm:text-5xl font-black text-white">How I Build <span className="gradient-text-violet">Your Pipeline</span></h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 stagger-children">
          {[
            { step: '01', title: 'Data Intake & Webhooks', desc: 'Ingests candidate, customer, or lead submissions instantly from webforms, APIs, or email streams.', color: 'from-cyan-400 to-cyan-600', borderColor: 'border-cyan-400/40' },
            { step: '02', title: 'AI Intelligence Engine', desc: 'Evaluates & scores incoming data against your business criteria using LLMs.', color: 'from-violet-400 to-violet-600', borderColor: 'border-violet-400/40' },
            { step: '03', title: 'Smart Router & Action', desc: 'High-priority items trigger calendar invites, alerts, or an automated response.', color: 'from-emerald-400 to-emerald-600', borderColor: 'border-emerald-400/40' },
            { step: '04', title: 'Multi-System Sync', desc: 'Synchronizes structured records across your CRM/database and notifies your team in real time.', color: 'from-cyan-400 to-emerald-500', borderColor: 'border-cyan-400/40' },
          ].map((item, i) => (
            <div key={i} className={`reveal glass p-7 rounded-2xl border-t-2 ${item.borderColor} pipeline-connector card-3d relative`}>
              <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br ${item.color} text-black font-mono font-black text-sm mb-5 shadow-lg`}>
                {item.step}
              </div>
              <h3 className="text-lg font-bold text-white mb-3">{item.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="glow-line max-w-4xl mx-auto" />

      {/* ═══════════ SOLUTIONS ═══════════ */}
      <section id="solutions" className="relative z-10 py-24 px-6 lg:px-8 max-w-7xl mx-auto" ref={solutionsRef}>
        <div className="text-center mb-16 reveal">
          <p className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-[0.25em] mb-3">● Core Capabilities</p>
          <h2 className="text-3xl sm:text-5xl font-black text-white">Custom Workflows I <span className="gradient-text">Automate</span></h2>
          <p className="text-slate-400 text-sm max-w-2xl mx-auto mt-4">Whatever manual repetitive process slows your team down, I can build an automated, reliable pipeline for it.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 stagger-children">
          {[
            {
              icon: '📥',
              title: 'Inquiry & Intake Qualification',
              desc: 'Parse incoming customer inquiries, job applications, or form submissions, score urgency/fit using AI models, and route them instantly.',
              features: ['Instant Lead/Intake Scoring', 'Smart Routing Rules', 'Zero Form Submission Lag'],
              borderColor: 'border-t-cyan-400',
            },
            {
              icon: '🔄',
              title: 'Multi-App Tech Stack Data Sync',
              desc: 'Keep your CRMs, Google Sheets, Airtable, Notion, and internal databases automatically in sync without manual CSV exports.',
              features: ['2-Way Real-Time Sync', 'Zero Manual Copy-Pasting', 'Built-in Error Recovery'],
              borderColor: 'border-t-violet-400',
            },
            {
              icon: '📅',
              title: 'Operational Dispatch & Scheduling',
              desc: 'Match incoming requests to team calendar slots, auto-dispatch booking links, and send instant alerts to your team on Slack or Email.',
              features: ['Multi-Timezone Auto Sync', 'Real-Time Team Alerts', '1-Click Booking Links'],
              borderColor: 'border-t-emerald-400',
            },
            {
              icon: '📄',
              title: 'Document & Data Extraction',
              desc: 'Extract structured data points from incoming PDFs, resumes, invoices, or quote requests directly into your central spreadsheet or CRM.',
              features: ['Automated Field Parsing', 'Clean Database Formatting', 'Fewer Data-Entry Errors'],
              borderColor: 'border-t-cyan-400',
            },
            {
              icon: '🧠',
              title: 'Custom Internal Knowledge Assistants',
              desc: 'Private AI search and assistants connected directly to your internal SOPs, Notion docs, and spreadsheets for instant answers.',
              features: ['Runs In Your Private Tools', 'Fast Information Retrieval', 'Instant SOP Guidance'],
              borderColor: 'border-t-violet-400',
            },
            {
              icon: '🛡️',
              title: 'Private & Secure Cloud Workflows',
              desc: 'Custom webhook endpoints, rate-limited middleware proxies, and encrypted API key vaults — built so your customer data and confidential business credentials never leak or get exposed.',
              features: ['AES-256 Encryption', 'Zero External Data Storage', 'Scoped Access Tokens'],
              borderColor: 'border-t-emerald-400',
            },
          ].map((item, i) => (
            <div key={i} className={`reveal glass p-8 rounded-3xl border-t-2 ${item.borderColor} card-3d relative flex flex-col justify-between`}>
              <div>
                <span className="text-4xl block mb-6">{item.icon}</span>
                <h3 className="text-xl font-bold text-white mb-4">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">{item.desc}</p>
              </div>
              <div className="space-y-2.5 pt-4 border-t border-white/[0.04]">
                {item.features.map((f, j) => (
                  <div key={j} className="flex items-center gap-2.5 text-xs text-slate-300 font-medium">
                    <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="glow-line max-w-4xl mx-auto" />

      {/* ═══════════ WORK / PROOF ═══════════ */}
      <section id="work" className="relative z-10 py-24 px-6 lg:px-8 max-w-7xl mx-auto" ref={workRef}>
        <div className="text-center mb-16 reveal">
          <p className="text-cyan-400 font-mono text-xs font-bold uppercase tracking-[0.25em] mb-3">● Proof, Not Promises</p>
          <h2 className="text-3xl sm:text-5xl font-black text-white">Working <span className="gradient-text">Demos & Prototypes</span></h2>
          <p className="text-slate-400 text-sm max-w-2xl mx-auto mt-4">I believe in showing working systems before asking for commitments. Here are live prototypes I&apos;ve engineered that can be adapted for your specific operations.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="reveal glass p-8 rounded-3xl border-t-2 border-t-cyan-400 card-3d">
            <span className="text-4xl block mb-6">📋</span>
            <h3 className="text-xl font-bold text-white mb-3">Autonomous Intake & Screening Pipeline</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              A live n8n workflow that ingests applications and inquiries, evaluates responses against custom scoring criteria using AI, and syncs structured records to Google Sheets and CRMs in under 3 seconds.
            </p>
            <a href="#contact" className="text-cyan-400 text-sm font-semibold hover:underline">Request a live video demo →</a>
          </div>

          <div className="reveal glass p-8 rounded-3xl border-t-2 border-t-emerald-400 card-3d">
            <span className="text-4xl block mb-6">🔄</span>
            <h3 className="text-xl font-bold text-white mb-3">Multi-App Operational Sync Engine</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-4">
              A 2-way sync bridge connecting web forms, internal spreadsheets, and team notification channels (Email, Slack, WhatsApp) with automatic error recovery and zero duplicate entries.
            </p>
            <a href="#contact" className="text-emerald-400 text-sm font-semibold hover:underline">Discuss a custom pipeline →</a>
          </div>
        </div>

        <div className="reveal mt-8 glass p-6 rounded-2xl flex flex-wrap items-center justify-center gap-6 text-sm text-slate-300 font-mono">
          <span className="text-cyan-400 font-semibold">🔒 Data Protection Trained (Byte Capsule)</span>
          <span className="text-slate-700">|</span>
          <span>100% In Your Own Accounts</span>
          <span className="text-slate-700">|</span>
          <span className="text-emerald-400">Fast 24–48h Working Demo</span>
        </div>
      </section>

      <div className="glow-line max-w-4xl mx-auto" />

      {/* ═══════════ ESTIMATE CALCULATOR ═══════════ */}
      <section id="roi" className="relative z-10 py-24 px-6 lg:px-8 max-w-5xl mx-auto" ref={calcRef}>
        <div ref={tiltCalc} className="reveal-scale glass-glow p-10 sm:p-14 rounded-3xl relative overflow-hidden gpu">

          <div className="text-center mb-12">
            <p className="text-emerald-400 font-mono text-xs font-bold uppercase tracking-[0.25em] mb-3">● Interactive Estimate</p>
            <h2 className="text-3xl sm:text-4xl font-black text-white">Estimate Your <span className="gradient-text">Potential Savings</span></h2>
            <p className="text-slate-500 text-xs mt-3 max-w-md mx-auto">A rough illustration based on your inputs — not a guaranteed or measured result.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

            {/* Sliders */}
            <div className="space-y-8">
              <div>
                <div className="flex justify-between text-sm font-medium text-slate-300 mb-3">
                  <span>Team Size (Coordinators / Ops Staff)</span>
                  <span className="text-cyan-400 font-mono font-bold text-lg">{team}</span>
                </div>
                <input type="range" min={1} max={50} value={team} onChange={(e) => setTeam(+e.target.value)} />
              </div>
              <div>
                <div className="flex justify-between text-sm font-medium text-slate-300 mb-3">
                  <span>Manual Admin Hours / Person / Week</span>
                  <span className="text-emerald-400 font-mono font-bold text-lg">{hours}h</span>
                </div>
                <input type="range" min={5} max={40} value={hours} onChange={(e) => setHours(+e.target.value)} />
              </div>
              <div>
                <div className="flex justify-between text-sm font-medium text-slate-300 mb-3">
                  <span>Loaded Hourly Labor Cost (Salary + Benefits)</span>
                  <span className="text-violet-400 font-mono font-bold text-lg">${rate}/hr</span>
                </div>
                <input type="range" min={20} max={75} value={rate} onChange={(e) => setRate(+e.target.value)} />
              </div>
            </div>

            {/* Results */}
            <div className="p-8 rounded-2xl bg-[#030712]/80 border border-white/[0.06] text-center space-y-6 shadow-inner">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-[0.2em] font-mono mb-2">Estimated Annual Savings</div>
                <div className="text-5xl sm:text-6xl font-black gradient-text font-mono counter-value">
                  ${yearly.toLocaleString()}
                </div>
                <div className="text-[11px] text-emerald-400/90 font-mono mt-2">
                  *Assumes 80% of theoretical time savings realized in practice
                </div>
              </div>
              <div className="border-t border-white/[0.06] pt-6 grid grid-cols-2 gap-6">
                <div>
                  <div className="text-xs text-slate-500 font-mono">Monthly Hours Saved (est.)</div>
                  <div className="text-2xl font-bold text-white font-mono mt-1">{monthly}h</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 font-mono">Typical First Demo</div>
                  <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">24 Hours</div>
                </div>
              </div>
            </div>

          </div>

          {/* Methodology footnote */}
          <div className="mt-10 pt-6 border-t border-white/[0.04] text-center text-[11px] text-slate-500 font-mono leading-relaxed">
            <span className="text-slate-400 font-bold">Estimate Methodology:</span> Savings = (Team Size × Weekly Admin Hours × 52 Weeks × ${rate}/hr Loaded Labor Rate) × 80% Efficiency Assumption. This is a planning estimate, not a measured or guaranteed outcome.
          </div>
        </div>
      </section>

      <div className="glow-line max-w-4xl mx-auto" />

      {/* ═══════════ SECURITY & DATA PRIVACY ═══════════ */}
      <section id="security" className="relative z-10 py-24 px-6 lg:px-8 max-w-5xl mx-auto text-center" ref={securityRef}>
        <div className="reveal glass p-12 rounded-3xl border-t-2 border-emerald-400/40 relative overflow-hidden">

          {/* Lock icon */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-8">
            <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Data Privacy & Security by <span className="gradient-text">Design</span></h2>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm leading-relaxed mb-10">
            Backed by formal training in Web Application Security & Data Protection (Byte Capsule ISO 27001 accredited), every automation is engineered to protect your confidential business data and keep your operations completely private.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 stagger-children">
            {[
              { title: 'Zero Data Retention', desc: 'Your business data flows directly between your authorized tools. We never store, log, or resell your records on third-party servers.' },
              { title: 'Encrypted Key Vaults', desc: 'API keys and webhooks are secured with strict authentication, scoped permissions, and SSL encryption in transit.' },
              { title: '100% Client Ownership', desc: 'You own every workflow JSON, script, and API configuration. Complete independence with zero vendor lock-in.' },
            ].map((item, i) => (
              <div key={i} className="reveal p-6 rounded-2xl bg-[#030712]/60 border border-white/[0.04] text-left hover:border-emerald-500/20 transition-all duration-500">
                <svg className="w-5 h-5 text-emerald-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <h4 className="text-white font-bold text-sm mb-2">{item.title}</h4>
                <p className="text-slate-400 text-xs leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CONTACT ═══════════ */}
      <section id="contact" className="relative z-10 py-28 px-6 lg:px-8 max-w-3xl mx-auto" ref={contactRef}>
        <div className="reveal-scale glass-glow p-10 sm:p-14 rounded-3xl relative overflow-hidden">

          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">Let&apos;s Build Your <span className="gradient-text">Automation</span></h2>
            <p className="text-slate-400 text-sm">
              Fill out below or email directly →{' '}
              <a href="mailto:contact@shakibul.com" className="text-cyan-400 font-mono font-semibold hover:underline">contact@shakibul.com</a>
            </p>
          </div>

          {submitted ? (
            <div className="p-10 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 text-center space-y-5">
              <svg className="w-14 h-14 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              <h3 className="text-2xl font-bold text-white">Message Received!</h3>
              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Thank you{form.name ? `, ${form.name}` : ''}! Your message has been sent successfully. I&apos;ll reply from <span className="text-cyan-400 font-mono">contact@shakibul.com</span> within 2 hours.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setForm({
                    name: '',
                    email: '',
                    company: '',
                    message: '',
                    bot_trap_secondary: '',
                    company_fax_number: '',
                    honey_company_url: ''
                  });
                }}
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-mono text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/10 hover:border-cyan-400 transition-all duration-300"
              >
                <span>← Send another message</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="space-y-6">
              {/* Honeypot traps for web scrapers & automated bots (autofill-resistant) */}
              <div className="sr-only opacity-0 absolute -z-10 pointer-events-none h-0 w-0 overflow-hidden" aria-hidden="true">
                <input
                  type="text"
                  name="bot_trap_secondary"
                  tabIndex={-1}
                  autoComplete="new-password"
                  value={form.bot_trap_secondary}
                  onChange={(e) => setForm({ ...form, bot_trap_secondary: e.target.value })}
                />
                <input
                  type="text"
                  name="company_fax_number"
                  tabIndex={-1}
                  autoComplete="new-password"
                  value={form.company_fax_number}
                  onChange={(e) => setForm({ ...form, company_fax_number: e.target.value })}
                />
                <input
                  type="text"
                  name="honey_company_url"
                  tabIndex={-1}
                  autoComplete="new-password"
                  value={form.honey_company_url}
                  onChange={(e) => setForm({ ...form, honey_company_url: e.target.value })}
                />
              </div>

              {errorMsg && (
                <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs font-medium text-center">
                  ⚠️ {errorMsg}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Your Name</label>
                  <input
                    type="text" required placeholder="Full Name"
                    value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Business Email</label>
                  <input
                    type="email" required placeholder="name@company.com"
                    value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="input-field"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                <input
                  type="text" placeholder="Company / Organization Name"
                  value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-2">Problem Description</label>
                <textarea
                  rows={4} required placeholder="Describe your current operational bottleneck or required AI workflow automation..."
                  value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                  className="input-field resize-none"
                />
              </div>
              {/* Cloudflare Turnstile CAPTCHA (MEDIUM-1) */}
              <div className="flex justify-center my-2">
                <div ref={turnstileRef} />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-shine w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-400 bg-[length:200%_auto] hover:bg-right transition-all duration-700 text-black font-bold text-base shadow-2xl shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin text-black" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                    <span>Sending Request...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    <span>Send Message</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="relative z-10 border-t border-white/[0.04] py-14 px-6 text-center space-y-4">
        <div className="flex items-center justify-center gap-2 text-white font-bold text-sm">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span>SHAKIBUL BOKHTIAR</span>
        </div>
        <p className="text-xs text-slate-600 font-mono">AI & Workflow Automation Systems Engineer</p>
        <p className="text-xs text-slate-600">
          © 2026 Shakibul Bokhtiar · All rights reserved ·{' '}
          <a href="mailto:contact@shakibul.com" className="text-cyan-500 hover:underline">contact@shakibul.com</a>
        </p>
      </footer>

      {/* Cloudflare Turnstile API */}
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="lazyOnload"
        onLoad={() => setTurnstileLoaded(true)}
      />

    </div>
  );
}
