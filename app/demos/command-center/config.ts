/* ═══════════════════════════════════════════════════════════════
   DEMO 4 — OPS COMMAND CENTER
   Shared config + data contract (imported by both the client page and
   the server API route).

   The story: leads scored by Demo 1's intake pipeline land in Supabase
   (`demo_leads`); this command center visualises them live. So Demo 4
   needs NO new n8n workflow — it just reads what Demo 1 already writes.

   PRIVACY BY DESIGN: the shapes below carry only NON-PII, presentable
   fields (industry, score, a generic headline, routed channel). Real
   submitter names / emails / phones / message bodies are NEVER mapped
   into a `Lead`. The server route enforces this when reading Supabase,
   and the mock uses the same safe shape, so the UI can't leak PII on
   either path.
   ═══════════════════════════════════════════════════════════════ */

/* ---------- DATA CONTRACT ---------- */

export type Temperature = 'HOT' | 'WARM' | 'COLD';
export type CommandMode = 'live' | 'simulated';

export interface Lead {
  id: string;             // stable unique id — the client de-dupes on this
  industry: string;       // machine key, e.g. 'fcommerce'
  industry_label: string; // human label, e.g. 'F-commerce'
  headline: string;       // PII-free one-liner, e.g. 'Wholesale skincare — 400+ orders/mo'
  score: number;          // 0–100 lead score from the intake pipeline
  temperature: Temperature;
  channel_label: string;  // client-facing routed channel, e.g. 'WhatsApp'
  response_ms: number;    // simulated pipeline handling time
  created_at: string;     // ISO timestamp
}

export interface KPIs {
  total_today: number;
  hot: number;
  avg_score: number;
  avg_response_ms: number;
}

export interface IndustrySlice {
  key: string;
  label: string;
  count: number;
}

export interface DashboardSnapshot {
  leads: Lead[];                                   // most-recent first
  kpis: KPIs;
  temperature: { hot: number; warm: number; cold: number };
  industries: IndustrySlice[];
  ticker: string[];                                // short activity lines
  generated_at: string;
}

export interface CommandResponse {
  success: boolean;
  mode: CommandMode; // 'live' = real Supabase read; 'simulated' = local stream
  snapshot?: DashboardSnapshot;
  error?: string;
}

/* ---------- SCORING BANDS (match the intake pipeline's spirit) ---------- */

export const HOT_MIN = 80;
export const WARM_MIN = 55;

export function tempFromScore(score: number): Temperature {
  if (score >= HOT_MIN) return 'HOT';
  if (score >= WARM_MIN) return 'WARM';
  return 'COLD';
}

/* ---------- THE INDUSTRY POOL (mirrors Demo 1's five verticals) ----------
   Each vertical carries its client-facing routed channel and a set of
   PII-free headlines so the simulated feed reads like real business. */

interface Vertical {
  key: string;
  label: string;
  channel: string;
  headlines: string[];
}

export const VERTICALS: Vertical[] = [
  {
    key: 'fcommerce',
    label: 'F-commerce',
    channel: 'WhatsApp',
    headlines: [
      'Wholesale skincare — 400+ orders/mo',
      'Fashion page — bulk reseller enquiry',
      'Homemade food page — catering lead',
      'Gadget page — COD order surge',
    ],
  },
  {
    key: 'clinic',
    label: 'Healthcare',
    channel: 'WhatsApp',
    headlines: [
      'Dental clinic — appointment booking',
      'Physio center — new patient intake',
      'Diagnostic lab — report delivery',
      'Eye hospital — consult scheduling',
    ],
  },
  {
    key: 'realestate',
    label: 'Real estate',
    channel: 'Call back',
    headlines: [
      'Apartment project — site-visit request',
      'Property agency — verified buyer lead',
      'Rental listing — tenant enquiry',
      'Commercial space — lease enquiry',
    ],
  },
  {
    key: 'coaching',
    label: 'Coaching / Edu',
    channel: 'Telegram',
    headlines: [
      'IELTS coaching — batch enrollment',
      'Online course — cohort signup',
      'Skill bootcamp — corporate training',
      'Admission consultancy — new applicant',
    ],
  },
  {
    key: 'services',
    label: 'Local services',
    channel: 'WhatsApp',
    headlines: [
      'Cleaning service — recurring contract',
      'Event planner — package enquiry',
      'Repair service — B2B maintenance deal',
      'Photography studio — booking request',
    ],
  },
];

const VERTICAL_BY_KEY: Record<string, Vertical> = Object.fromEntries(
  VERTICALS.map((v) => [v.key, v]),
);

/* ---------- SMALL RANDOM HELPERS (used at request/timer time only) ----------
   Kept inside functions so nothing random runs at import (no hydration
   surprises); the client's first paint always uses the server snapshot. */

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

let idCounter = 0;
function makeId(atMs: number): string {
  idCounter = (idCounter + 1) % 100000;
  return `L-${atMs.toString(36)}-${idCounter.toString(36)}`;
}

/* Weight scores toward the believable middle, with occasional HOT spikes. */
function sampleScore(): number {
  const base = randInt(38, 79);
  const spike = Math.random() < 0.28 ? randInt(6, 20) : 0;
  return Math.min(98, base + spike);
}

/** One synthetic, PII-free lead stamped at `atMs`. Exported so the client
    can inject arrivals into the simulated stream on a timer. */
export function makeRandomLead(atMs: number): Lead {
  const v = pick(VERTICALS);
  const score = sampleScore();
  return {
    id: makeId(atMs),
    industry: v.key,
    industry_label: v.label,
    headline: pick(v.headlines),
    score,
    temperature: tempFromScore(score),
    channel_label: v.channel,
    response_ms: randInt(1400, 4200),
    created_at: new Date(atMs).toISOString(),
  };
}

/* ---------- SHARED AGGREGATORS (used by BOTH mock and live paths) ----------
   The server maps real Supabase rows into Lead[] then calls these, so the
   dashboard maths is identical whether simulated or live. */

export function computeKpis(leads: Lead[]): KPIs {
  if (leads.length === 0) {
    return { total_today: 0, hot: 0, avg_score: 0, avg_response_ms: 0 };
  }
  const hot = leads.filter((l) => l.temperature === 'HOT').length;
  const avgScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length);
  const avgResp = Math.round(leads.reduce((s, l) => s + l.response_ms, 0) / leads.length);
  return { total_today: leads.length, hot, avg_score: avgScore, avg_response_ms: avgResp };
}

export function computeTemperature(leads: Lead[]): { hot: number; warm: number; cold: number } {
  return {
    hot: leads.filter((l) => l.temperature === 'HOT').length,
    warm: leads.filter((l) => l.temperature === 'WARM').length,
    cold: leads.filter((l) => l.temperature === 'COLD').length,
  };
}

export function computeIndustries(leads: Lead[]): IndustrySlice[] {
  return VERTICALS.map((v) => ({
    key: v.key,
    label: v.label,
    count: leads.filter((l) => l.industry === v.key).length,
  })).sort((a, b) => b.count - a.count);
}

/** A short human activity line for the ticker. */
export function tickerLine(l: Lead): string {
  return `New ${l.industry_label} lead scored ${l.score} (${l.temperature}) · routed to ${l.channel_label}`;
}

export function makeTicker(leads: Lead[], max = 6): string[] {
  return leads.slice(0, max).map(tickerLine);
}

/* ---------- BUILD A FULL MOCK SNAPSHOT ----------
   `nowMs` is passed in (never read from the module) so callers stay in
   control of time. Generates `count` leads spread over the last few hours,
   newest first, then derives every aggregate from them. */

export function buildMockSnapshot(nowMs: number, count = 14): DashboardSnapshot {
  const leads: Lead[] = [];
  let t = nowMs;
  for (let i = 0; i < count; i++) {
    // step back an irregular gap so timestamps look organic
    t -= randInt(3, 26) * 60 * 1000;
    leads.push(makeRandomLead(t));
  }
  // newest first
  leads.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return {
    leads,
    kpis: computeKpis(leads),
    temperature: computeTemperature(leads),
    industries: computeIndustries(leads),
    ticker: makeTicker(leads),
    generated_at: new Date(nowMs).toISOString(),
  };
}

/* ---------- RELATIVE-TIME LABEL (for feed rows) ---------- */

export function agoLabel(fromIso: string, nowMs: number): string {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return 'just now';
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 8) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}
