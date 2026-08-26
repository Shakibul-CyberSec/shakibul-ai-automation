import { NextResponse } from 'next/server';
import {
  computeMockResult,
  INDUSTRIES,
  type IntakeRequest,
  type IntakeResult,
  type IntakeResponse,
  type Tier,
  type Urgency,
} from '../../../demos/intake/config';

/* ═══════════════════════════════════════════════════════════════
   DEMO 1 — INTAKE ENGINE — API BRIDGE
   Browser -> (this same-origin route) -> n8n webhook.

   Why this exists: the site CSP is `connect-src 'self'`, so the
   browser cannot call the n8n webhook directly. This route is the
   bridge. It also keeps the n8n URL server-side (never exposed).

   GO LIVE: set N8N_INTAKE_WEBHOOK_URL in .env.local to your n8n
   Production Webhook URL. Until then it returns a realistic mock,
   so the demo is never broken.
   ═══════════════════════════════════════════════════════════════ */

const N8N_WEBHOOK = process.env.N8N_INTAKE_WEBHOOK_URL;
const MAX_FIELD_LEN = 2000;

// Strip control chars; cap length. Basic hardening for a public demo.
function clean(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, MAX_FIELD_LEN);
}

const TIERS: Tier[] = ['HOT', 'WARM', 'COLD'];
const URGENCIES: Urgency[] = ['high', 'medium', 'low'];

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.slice(0, MAX_FIELD_LEN) : fallback;
}

/*
   Normalize whatever n8n returns into a valid IntakeResult.
   The AI-built workflow may omit a field, send a number as a string, or
   return `tags` as a comma-string. We overlay its output on a full mock
   baseline so the presentation layer can never render `undefined`/`NaN`.
   n8n's values win when present and sane; the baseline fills every gap.
*/
function normalizeResult(raw: unknown, baseline: IntakeResult): IntakeResult {
  const r = (raw ?? {}) as Record<string, unknown>;

  const scoreNum = Number(r.score);
  const score = Number.isFinite(scoreNum)
    ? Math.max(0, Math.min(100, Math.round(scoreNum)))
    : baseline.score;

  const tier: Tier = TIERS.includes(r.tier as Tier) ? (r.tier as Tier) : baseline.tier;
  const urgency: Urgency = URGENCIES.includes(r.urgency as Urgency)
    ? (r.urgency as Urgency)
    : baseline.urgency;

  // tags: accept string[] or a comma/semicolon-separated string
  let tags: string[];
  if (Array.isArray(r.tags)) {
    tags = r.tags.map((t) => clean(t)).filter(Boolean).slice(0, 4);
  } else if (typeof r.tags === 'string' && r.tags.trim()) {
    tags = r.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean).slice(0, 4);
  } else {
    tags = baseline.tags;
  }
  if (tags.length === 0) tags = baseline.tags;

  const msNum = Number(r.processed_in_ms);
  const processed_in_ms =
    Number.isFinite(msNum) && msNum >= 0 ? Math.round(msNum) : baseline.processed_in_ms;

  return {
    score,
    tier,
    urgency,
    tags,
    summary: str(r.summary, baseline.summary),
    reasoning: str(r.reasoning, baseline.reasoning),
    routed_to: str(r.routed_to, baseline.routed_to),
    recommended_action: str(r.recommended_action, baseline.recommended_action),
    notification_channel: str(r.notification_channel, baseline.notification_channel),
    notification_message: str(r.notification_message, baseline.notification_message),
    record_id: str(r.record_id, baseline.record_id),
    processed_in_ms,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const industry = clean(raw.industry);

  if (!industry || !INDUSTRIES[industry]) {
    return NextResponse.json({ success: false, error: 'Unknown industry' }, { status: 400 });
  }

  // Sanitize submission against the industry's declared fields only.
  const cfg = INDUSTRIES[industry];
  const rawSubmission = (raw.submission ?? {}) as Record<string, unknown>;
  const submission: Record<string, string> = {};
  for (const field of cfg.fields) {
    submission[field.name] = clean(rawSubmission[field.name]);
  }

  const payload: IntakeRequest = {
    industry,
    submission,
    meta: { source: 'demo', submitted_at: new Date().toISOString() },
  };

  // ---------- LIVE MODE: forward to n8n ----------
  if (N8N_WEBHOOK) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(N8N_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        // Accept either {result:{...}} or a bare result object from n8n,
        // then normalize it onto a full baseline so a partial/malformed
        // workflow response can never break the presentation layer.
        const rawResult = data?.result ?? data;
        const result = normalizeResult(rawResult, computeMockResult(payload));
        const response: IntakeResponse = { success: true, mode: 'live', result };
        return NextResponse.json(response);
      }
      // fall through to mock on non-200
    } catch {
      // fall through to mock on network/timeout error
    }
  }

  // ---------- MOCK MODE: realistic local result ----------
  const result = computeMockResult(payload);
  const response: IntakeResponse = { success: true, mode: 'mock', result };
  return NextResponse.json(response);
}

export async function GET() {
  return NextResponse.json({
    demo: 'intake-engine',
    live: Boolean(N8N_WEBHOOK),
    industries: Object.keys(INDUSTRIES),
  });
}
