import { NextResponse } from 'next/server';
import {
  buildMockSnapshot,
  computeKpis,
  computeTemperature,
  computeIndustries,
  makeTicker,
  tempFromScore,
  VERTICALS,
  type Lead,
  type DashboardSnapshot,
  type CommandResponse,
} from '../../../demos/command-center/config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 4 — OPS COMMAND CENTER — API BRIDGE
   Browser -> (this same-origin route) -> Supabase (server-side).

   Why this exists: the site CSP is `connect-src 'self'`, so the browser
   cannot talk to Supabase directly. This route is the bridge and it keeps
   the Supabase key server-side (never shipped to the client). That also
   means the anon key is never exposed and RLS misconfig can't leak data.

   PRIVACY: we read from a PII-safe source (a view — default
   `demo_leads_public`) AND, belt-and-braces, only ever map a fixed set of
   NON-PII columns into a Lead. Names/emails/phones/messages are never
   read into the response, on any path.

   • LIVE  → reads recent rows from Supabase, maps + aggregates them.
   • local → returns a simulated snapshot from config.ts (the client then
             self-drives the live stream). Demo is never broken.

   GO LIVE: set SUPABASE_URL + SUPABASE_KEY in .env.local (see
   supabase-setup.md). Optionally SUPABASE_LEADS_TABLE (default
   `demo_leads_public`).
   ═══════════════════════════════════════════════════════════════ */

export const dynamic = 'force-dynamic'; // never cache — this is a live feed

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const LEADS_TABLE = process.env.SUPABASE_LEADS_TABLE || 'demo_leads_public';
const LIVE = Boolean(SUPABASE_URL && SUPABASE_KEY);

const TIMEOUT_MS = 12000;
const MAX_ROWS = 30;
const CONTROL_CHARS = /[\x00-\x1F\x7F]+/g;

/* ---- tiny defensive coercers ---- */
function s(v: unknown, max = 160): string {
  if (typeof v !== 'string') return '';
  return v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function cap(w: string): string {
  return w ? w.charAt(0).toUpperCase() + w.slice(1) : '';
}

/*
   Map ONE raw row into a sanitized Lead. Only a fixed allow-list of
   non-PII keys is ever read; anything else on the row is ignored. Missing
   fields are derived so the UI always has a complete, safe Lead.
*/
function toLead(raw: unknown, i: number, nowMs: number): Lead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const industryKey = s(r.industry ?? r.vertical ?? r.business_type, 40).toLowerCase();
  const v = VERTICALS.find((x) => x.key === industryKey);

  const score = clamp(Math.round(num(r.score ?? r.lead_score, 0)), 0, 100);
  const created = s(r.created_at ?? r.inserted_at ?? r.createdAt, 40) || new Date(nowMs).toISOString();

  // headline must be PII-free at the source; we still cap + fall back safely
  const headline = s(r.headline, 120) || (v ? `${v.label} — new lead` : 'New qualified lead');

  return {
    id: s(r.id, 60) || `live-${i}`,
    industry: v?.key ?? (industryKey || 'services'),
    industry_label: v?.label ?? (cap(industryKey) || 'Lead'),
    headline,
    score,
    temperature: tempFromScore(score),
    channel_label: s(r.channel_label ?? r.channel, 40) || v?.channel || 'WhatsApp',
    response_ms: clamp(Math.round(num(r.response_ms, 2200)), 0, 120000),
    created_at: created,
  };
}

/* ---- read recent rows from Supabase via PostgREST; null on any failure ---- */
async function readSupabase(nowMs: number): Promise<Lead[] | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const base = SUPABASE_URL.replace(/\/+$/, '');
  const url =
    `${base}/rest/v1/${encodeURIComponent(LEADS_TABLE)}` +
    `?select=*&order=created_at.desc&limit=${MAX_ROWS}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows
      .map((row, i) => toLead(row, i, nowMs))
      .filter((l): l is Lead => l !== null);
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

function snapshotFrom(leads: Lead[], nowMs: number): DashboardSnapshot {
  return {
    leads,
    kpis: computeKpis(leads),
    temperature: computeTemperature(leads),
    industries: computeIndustries(leads),
    ticker: makeTicker(leads),
    generated_at: new Date(nowMs).toISOString(),
  };
}

export async function GET() {
  const nowMs = Date.now();

  if (LIVE) {
    const leads = await readSupabase(nowMs);
    // Only call it "live" when we actually have real rows — never show an
    // empty board, and never blend synthetic leads into a live response.
    if (leads && leads.length > 0) {
      const response: CommandResponse = {
        success: true,
        mode: 'live',
        snapshot: snapshotFrom(leads, nowMs),
      };
      return NextResponse.json(response);
    }
    // else fall through to a simulated snapshot
  }

  const response: CommandResponse = {
    success: true,
    mode: 'simulated',
    snapshot: buildMockSnapshot(nowMs),
  };
  return NextResponse.json(response);
}
