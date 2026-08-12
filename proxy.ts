import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/* ---------- UPSTASH REDIS IMPORT (with fallback) ---------- */
let kv: any = null;
let kvAvailable = false;

if (typeof process !== 'undefined' && process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis');
    kv = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
    kvAvailable = true;
  } catch (error) {
    kvAvailable = false;
  }
}

/* ---------- RATE LIMIT CONFIG ---------- */
const RATE_LIMITS: Record<string, { count: number; window: number }> = {
  NORMAL: { count: 5, window: 5 * 60 * 1000 },      // 5 requests per 5 minutes for AI agency
  SUSPICIOUS: { count: 2, window: 30 * 60 * 1000 },  // 2 requests per 30 minutes
  ABUSIVE: { count: 1, window: 2 * 60 * 60 * 1000 } // 1 request per 2 hours
};

const ESCALATION_THRESHOLD = 3;
const COOLDOWN_PERIOD = 24 * 60 * 60 * 1000;

// Memory storage fallback
const memoryCache = new Map<string, any>();
const shadowBanned = new Set<string>();

/* ---------- KV STORAGE HELPERS ---------- */
const KV_PREFIXES = {
  RATE_LIMIT: 'rl:',
  VIOLATION: 'vio:',
  SHADOW_BAN: 'ban:',
  SUBNET: 'sub:',
};

async function kvGet(key: string) {
  if (!kvAvailable || !kv) return memoryCache.get(key) || null;
  try {
    return await kv.get(key);
  } catch (error) {
    return memoryCache.get(key) || null;
  }
}

async function kvSet(key: string, value: any, expirySeconds: number | null = null) {
  if (!kvAvailable || !kv) {
    memoryCache.set(key, value);
    return;
  }
  try {
    if (expirySeconds) {
      await kv.set(key, value, { ex: expirySeconds });
    } else {
      await kv.set(key, value);
    }
    memoryCache.set(key, value);
  } catch (error) {
    memoryCache.set(key, value);
  }
}

async function kvSadd(key: string, member: string) {
  if (!kvAvailable || !kv) {
    shadowBanned.add(member);
    return;
  }
  try {
    await kv.sadd(key, member);
    shadowBanned.add(member);
  } catch (error) {
    shadowBanned.add(member);
  }
}

async function kvSismember(key: string, member: string) {
  if (!kvAvailable || !kv) return shadowBanned.has(member);
  try {
    const isMember = await kv.sismember(key, member);
    if (isMember) shadowBanned.add(member);
    return isMember === 1;
  } catch (error) {
    return shadowBanned.has(member);
  }
}

/* ---------- BOT DETECTION ---------- */
const BAD_BOTS = [
  'curl', 'wget', 'python', 'httpclient', 'go-http-client',
  'axios', 'node-fetch', 'postman', 'insomnia', 'scrapy',
  'bot', 'crawler', 'spider', 'selenium', 'phantomjs', 'headless'
];

function isBotUserAgent(ua: string | null) {
  const normalizedUA = (ua || '').toLowerCase();
  return BAD_BOTS.some(bot => normalizedUA.includes(bot));
}

/* ---------- IP SUBNET EXTRACTION ---------- */
function getIPSubnet(ip: string) {
  if (!ip || ip === 'unknown') return 'unknown';
  const ipv4Match = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (ipv4Match) return ipv4Match[1];
  const ipv6Match = ip.match(/^([0-9a-f:]+::[0-9a-f:]+|[0-9a-f:]+:[0-9a-f:]+:[0-9a-f:]+)/i);
  if (ipv6Match) return ipv6Match[1];
  return ip;
}

/* ---------- IP EXTRACTION ---------- */
function getClientIP(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/* ---------- RATE LIMIT TIER MANAGEMENT ---------- */
async function getViolationTier(clientKey: string) {
  const violations = await kvGet(KV_PREFIXES.VIOLATION + clientKey);
  if (!violations) return 'NORMAL';
  if (Date.now() - violations.lastViolation > COOLDOWN_PERIOD) return 'NORMAL';
  if (violations.count >= ESCALATION_THRESHOLD * 2) return 'ABUSIVE';
  if (violations.count >= ESCALATION_THRESHOLD) return 'SUSPICIOUS';
  return 'NORMAL';
}

async function recordViolation(clientKey: string, subnetKey: string) {
  const now = Date.now();
  for (const key of [clientKey, subnetKey]) {
    const violations = (await kvGet(KV_PREFIXES.VIOLATION + key)) || { count: 0, lastViolation: 0 };
    violations.count++;
    violations.lastViolation = now;
    await kvSet(KV_PREFIXES.VIOLATION + key, violations, 48 * 60 * 60);

    if (violations.count >= ESCALATION_THRESHOLD * 3) {
      await kvSadd(KV_PREFIXES.SHADOW_BAN + 'set', key);
    }
  }
}

/* ---------- BEHAVIORAL ANALYSIS ---------- */
async function checkBehavior(clientKey: string, now: number) {
  const record = await kvGet(KV_PREFIXES.RATE_LIMIT + clientKey);
  if (!record || !record.lastRequest) return true;
  const timeDiff = now - record.lastRequest;
  return timeDiff >= 800;
}

/* ---------- SUBNET-WIDE TRACKING ---------- */
async function getSubnetRequests(subnet: string, now: number, windowMs: number) {
  if (!kvAvailable || !kv) {
    let totalRequests = 0;
    for (const [key, record] of memoryCache.entries()) {
      if (key.startsWith(KV_PREFIXES.RATE_LIMIT) && key.includes(subnet + ':') && (now - record.start < windowMs)) {
        totalRequests += record.count;
      }
    }
    return totalRequests;
  }
  try {
    const pattern = `${KV_PREFIXES.RATE_LIMIT}${subnet}:*`;
    const keys = await kv.keys(pattern);
    let totalRequests = 0;
    for (const key of keys) {
      const record = await kv.get(key);
      if (record && (now - record.start < windowMs)) {
        totalRequests += record.count;
      }
    }
    return totalRequests;
  } catch (error) {
    return 0;
  }
}

let lastCleanupTime = 0;
const CLEANUP_INTERVAL = 10 * 60 * 1000;
function maybeCleanupMemory() {
  const now = Date.now();
  if (now - lastCleanupTime > CLEANUP_INTERVAL) {
    lastCleanupTime = now;
    if (kvAvailable) return;
    const maxAge = Math.max(...Object.values(RATE_LIMITS).map(l => l.window));
    for (const [key, record] of memoryCache.entries()) {
      if (now - record.start > maxAge * 2) {
        memoryCache.delete(key);
      }
    }
  }
}

/* ---------- MIDDLEWARE SECURITY PROXY ---------- */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  maybeCleanupMemory();

  // Rate Limiting for Email API Route
  if (pathname === '/api/SendEmail') {
    const ip = getClientIP(request);
    const subnet = getIPSubnet(ip);
    const method = request.method;

    const clientKey = `${ip}:${method}`;
    const subnetKey = `subnet:${subnet}:${method}`;

    // Bot UA Detection
    const ua = request.headers.get('user-agent') || '';
    if (isBotUserAgent(ua)) {
      return new NextResponse(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store' }
      });
    }

    // Shadow Ban Check
    const isClientBanned = await kvSismember(KV_PREFIXES.SHADOW_BAN + 'set', clientKey);
    const isSubnetBanned = await kvSismember(KV_PREFIXES.SHADOW_BAN + 'set', subnetKey);

    if (isClientBanned || isSubnetBanned) {
      return new NextResponse(
        JSON.stringify({
          success: true,
          message: 'Thank you for reaching out! Your message has been sent successfully.'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    const now = Date.now();

    // Behavioral Analysis (<800ms rapid fire check)
    if (!(await checkBehavior(clientKey, now))) {
      await recordViolation(clientKey, subnetKey);
      return new NextResponse(
        JSON.stringify({
          error: 'Request rejected. Please slow down.',
          type: 'behavior'
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Rate Limit Tiers
    const tier = await getViolationTier(clientKey);
    const subnetTier = await getViolationTier(subnetKey);
    const effectiveTier = RATE_LIMITS[subnetTier].window > RATE_LIMITS[tier].window ? subnetTier : tier;
    const limit = RATE_LIMITS[effectiveTier];

    const record = (await kvGet(KV_PREFIXES.RATE_LIMIT + clientKey)) || {
      count: 0,
      start: now,
      lastRequest: 0,
      tier: effectiveTier
    };

    if (now - record.start > limit.window) {
      record.count = 0;
      record.start = now;
      record.tier = effectiveTier;
    }

    record.count++;
    record.lastRequest = now;

    const expirySeconds = Math.ceil(limit.window / 1000);
    await kvSet(KV_PREFIXES.RATE_LIMIT + clientKey, record, expirySeconds);

    // Subnet Limit Check
    const subnetRequests = await getSubnetRequests(subnet, now, limit.window);
    const SUBNET_MULTIPLIER = 3;

    if (subnetRequests > limit.count * SUBNET_MULTIPLIER) {
      await recordViolation(clientKey, subnetKey);
      const retryAfter = Math.ceil((record.start + limit.window - now) / 1000);
      return new NextResponse(
        JSON.stringify({
          error: 'Too many requests from your network. Please try again later.',
          type: 'subnet_limit'
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Rate limit block
    if (record.count > limit.count) {
      await recordViolation(clientKey, subnetKey);
      const retryAfter = Math.ceil((record.start + limit.window - now) / 1000);
      const minutes = Math.ceil(retryAfter / 60);

      let errorMessage;
      switch (effectiveTier) {
        case 'ABUSIVE':
          errorMessage = `Account temporarily restricted. Please try again in ${Math.ceil(retryAfter / 3600)} hour(s).`;
          break;
        case 'SUSPICIOUS':
          errorMessage = `Too many attempts detected. Please try again in ${minutes} minute(s).`;
          break;
        default:
          errorMessage = `Too many requests. Please try again in ${minutes} minute(s).`;
      }

      return new NextResponse(
        JSON.stringify({
          error: errorMessage,
          type: 'rate_limit'
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString(),
            'Cache-Control': 'no-store',
          },
        }
      );
    }
  }

  /* ---------- Generate Nonce & Strict CSP ---------- */
  const nonceArray = new Uint8Array(16);
  crypto.getRandomValues(nonceArray);
  const nonce = Array.from(nonceArray, byte => byte.toString(16).padStart(2, '0')).join('');

  const response = NextResponse.next();

  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = `script-src 'self' 'nonce-${nonce}' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ''} https://challenges.cloudflare.com;`;
  const styleSrc = `style-src 'self' 'nonce-${nonce}' 'unsafe-inline' https://fonts.googleapis.com;`;

  const cspHeader = `
    default-src 'self';
    ${scriptSrc}
    ${styleSrc}
    font-src 'self' data: https://fonts.gstatic.com;
    img-src 'self' data: blob: https:;
    media-src 'self' data: blob:;
    connect-src 'self' https://challenges.cloudflare.com;
    frame-src 'self' https://challenges.cloudflare.com;
    frame-ancestors 'none';
    base-uri 'none';
    form-action 'self';
    object-src 'none';
  `
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  response.headers.set('Content-Security-Policy', cspHeader);
  response.headers.set('x-nonce', nonce);

  /* ---------- Security Headers ---------- */
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|demo.mp4).*)'],
};
