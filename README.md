# shakibul.com — AI Automation & Systems Engineering

Personal site and client-intake platform for **Shakibul Bokhtiar**, an independent AI automation & systems engineer.

Built as a working demonstration of the thing it sells: if I claim to build secure, private pipelines for clients, the site itself has to hold up to the same standard. The hardening below is the point, not decoration.

**Live:** [shakibul.com](https://shakibul.com)

---

## What I build for clients

| Service | Description |
| :--- | :--- |
| **Autonomous intake & qualification** | Parse inbound inquiries/RFPs, score fit and urgency with LLMs, route instantly |
| **Forensic document & contract intelligence** | Extract SLA liabilities, auto-renewal traps, and non-standard clauses from long agreements |
| **Multi-app data sync** | Two-way sync across CRMs, Sheets, Airtable, Notion, SQL — no manual CSV exports |
| **Bespoke internal tools** | Lightweight private portals, dashboards, and review consoles |
| **Private SOP assistants** | Retrieval grounded in internal docs, no public model training |
| **Zero-trust pipelines** | Scoped tokens, rate-limited proxies, encrypted credential storage |

Engagements run in three phases: **Discovery audit → Custom build → Ongoing retainer.** Clients keep 100% of source code and workflow configuration. No vendor lock-in.

---

## Tech stack

- **Framework** — Next.js 16 (App Router, React 19, TypeScript)
- **Styling** — Tailwind CSS v4
- **Motion** — GSAP, Lenis smooth scroll, IntersectionObserver reveals, RAF-throttled 3D tilt
- **Email** — Nodemailer over SMTP (SSL 465, TLS 587 fallback)
- **Rate limiting** — Upstash Redis, with in-memory fallback if unconfigured
- **Bot mitigation** — Cloudflare Turnstile + triple honeypot fields
- **Hosting** — Vercel

---

## Security engineering

The interesting part of this repo. Implemented in `proxy.ts` and `app/api/SendEmail/route.ts`.

**Strict CSP with per-request nonces**
- Cryptographically random 16-byte nonce generated per request via `crypto.getRandomValues()`
- `script-src 'self' 'nonce-<n>' 'strict-dynamic'` — no `unsafe-inline` in production
- Nonce propagated to the App Router through the `x-nonce` header and consumed by `NonceScript`
- Zero inline styles anywhere in the render path; decorative particles are pure CSS classes so nothing needs an inline `style` attribute

**Response headers**

`Content-Security-Policy` · `Strict-Transport-Security` · `X-Content-Type-Options: nosniff` · `X-Frame-Options: DENY` · `Referrer-Policy: strict-origin-when-cross-origin` · `poweredByHeader: false` (no framework fingerprinting)

**Contact endpoint hardening**
- **Header injection defense** — CRLF and control characters stripped from every field before they reach a mail header
- **Sanitization ordering** — tags stripped *before* attributes, then `javascript:`/`vbscript:`/`data:`/`on*=` removed in a fixed-point loop so nested-encoding bypasses cannot survive
- **Layered rate limits** — 3/hour, 5/day per email address, automatic ban at 10 total, Redis-backed with graceful in-memory degradation
- **Honeypots** — three trap fields using `autocomplete="new-password"` so password managers don't false-positive them
- **CAPTCHA** — server-side Turnstile token verification, not just client-side rendering

**Supply chain** — Dependabot + a CI security-audit workflow in `.github/`.

---

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build
npm run lint         # eslint
```

### Environment variables

Create `.env.local` in the project root. It is gitignored and must never be committed.

```ini
# SMTP — contact form delivery
EMAIL_USER=contact@yourdomain.com
EMAIL_PASSWORD=your_smtp_app_password

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=your_site_key
TURNSTILE_SECRET_KEY=your_secret_key

# Upstash Redis — optional; falls back to in-memory rate limiting
KV_REST_API_URL=https://your-instance.upstash.io
KV_REST_API_TOKEN=your_token

# Optional: trusted proxy header for client IP resolution
TRUSTED_IP_HEADER=x-forwarded-for
```

Turnstile and Redis are both optional locally — the app degrades gracefully without them.

---

## Project structure

```
app/
  page.tsx                 # single-page site: hero, process, capabilities,
                           # packages, estimate calculator, security, contact
  layout.tsx               # metadata, fonts, CSP nonce wiring
  api/SendEmail/route.ts   # hardened contact endpoint
  components/
    NonceScript.tsx        # CSP-safe script injection
  globals.css              # Tailwind v4 + animation primitives
proxy.ts                   # security headers, CSP nonce, edge rate limiting
scripts/
  outreach_sender.py       # SMTP outreach tool (see below)
public/
```

---

## `scripts/outreach_sender.py`

A standalone SMTP sender for business development. Reads a JSON array of leads, sends multipart plaintext + HTML email, and maintains `sent_log.json` to guarantee no duplicate contact.

```bash
python3 scripts/outreach_sender.py scripts/leads.json
```

Lead files use this shape:

```json
[{ "name": "...", "email": "...", "company": "...", "subject": "...", "body": "..." }]
```

Behavior notes:
- Credentials load from `.env.local` — never hardcoded
- Randomized 120–300s delay between sends
- Any filename containing `test` switches to a 5s delay and bypasses the dedupe log
- Already-contacted addresses are skipped automatically

**Lead data is gitignored.** `outreach_checkpoint.md` and `scripts/*.json` contain third-party personal and business information and are excluded from version control by design. Do not remove those `.gitignore` entries.

> If you fork this: send cold outreach from a **separate, warmed sending domain** — not your primary brand domain. A spam flag on your main domain costs you your professional email and is slow to reverse. Configure SPF, DKIM, and DMARC before the first send.

---

## License

No license granted. Personal portfolio and brand assets — the design, copy, and branding are not for reuse. The security patterns in `proxy.ts` and the contact endpoint are documented above and free to learn from.

---

**Contact** — [contact@shakibul.com](mailto:contact@shakibul.com) · [shakibul.com](https://shakibul.com)
