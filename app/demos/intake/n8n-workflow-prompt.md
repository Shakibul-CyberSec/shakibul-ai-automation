# Demo 1 — "Live Intake Engine" — n8n Build Kit

This is everything you need to build the **hidden engine** for Demo 1 using n8n's
AI workflow builder. The Next.js side (the page the prospect sees, the API bridge,
the mock fallback) is already done and already speaks the contract below.

**The moment you paste your n8n Production Webhook URL into the site's
`N8N_INTAKE_WEBHOOK_URL` env var, the demo flips from SIMULATED to LIVE (n8n) with
zero code changes.** Until then the page runs on a realistic mock, so nothing is
ever broken while you build.

> The whole trick: the prospect **never** sees n8n. They see a polished page. n8n is
> the engine under the hood. Keep it that way.

---

## 0. The contract (this is non-negotiable — the frontend already depends on it)

### What n8n RECEIVES (HTTP POST body)

```json
{
  "industry": "fcommerce",
  "submission": {
    "name": "Sadia Islam",
    "phone": "+8801712345678",
    "product": "Bulk / Wholesale",
    "quantity": "20+ (wholesale)",
    "message": "Amar ekta boutique ache. Ei kurti gulo 30 piece lagbe reseller price e. Kalke r moddhe Dhaka te delivery possible?"
  },
  "meta": { "source": "demo", "submitted_at": "2026-08-25T10:00:00.000Z" }
}
```

`industry` is one of: `fcommerce`, `clinic`, `realestate`, `legal`, `logistics`.
`submission` fields differ per industry — **do not hard-code field names**; read
whatever comes in.

### What n8n MUST RETURN (JSON, HTTP 200)

```json
{
  "result": {
    "score": 87,
    "tier": "HOT",
    "urgency": "high",
    "tags": ["urgent", "high-value", "wholesale"],
    "summary": "Sadia Islam — high-intent f-commerce lead re: bulk/wholesale kurti order.",
    "reasoning": "Explicit next-day delivery deadline plus a 30-piece reseller order — strong urgency and value signals.",
    "routed_to": "Order Desk (Priority)",
    "recommended_action": "Contact within 15 minutes — do not queue.",
    "notification_channel": "WhatsApp",
    "notification_message": "🔔 New HOT lead — F-Commerce\nSadia Islam (+8801712345678)\nInterest: Bulk / Wholesale\nScore: 87/100 · Route: Order Desk (Priority)\nAction: Contact within 15 minutes — do not queue.",
    "record_id": "REC-AB12CD",
    "processed_in_ms": 2140
  }
}
```

Return **all 12 fields**. (The site has a safety net that back-fills anything
missing, but a complete response is what makes the demo shine.) Returning a bare
object without the `result` wrapper also works — the bridge accepts both.

---

## 1. PART A — Paste this into n8n's AI builder ("Build with AI")

```
Build a workflow named "Demo 1 — Live Intake Engine". It qualifies an inbound
business lead and returns a structured JSON scorecard synchronously to the caller.

Nodes, connected in this order:

1. Webhook (trigger). HTTP method POST, path "intake". Set the "Respond" option to
   "Using 'Respond to Webhook' node". The incoming JSON body looks like:
   { "industry": "fcommerce",
     "submission": { "name": "...", "phone": "...", "message": "..." },
     "meta": { "source": "demo", "submitted_at": "<ISO timestamp>" } }
   The industry can be fcommerce, clinic, realestate, legal, or logistics, and the
   submission fields vary by industry.

2. A Basic LLM Chain node with an OpenAI-compatible Chat Model. Send it the incoming
   industry and submission. It must reply with ONLY a valid JSON object (no markdown,
   no commentary) containing exactly these keys: score (integer 0-100), tier
   ("HOT" | "WARM" | "COLD"), urgency ("high" | "medium" | "low"), tags (array of 2-4
   short strings), summary (one sentence), reasoning (one sentence), routed_to
   (string), recommended_action (string), notification_channel (string),
   notification_message (multi-line string). Use the system prompt I will paste into
   this node.

3. A Code node named "Assemble". Take the LLM's JSON output, add two fields —
   record_id ("REC-" followed by 6 uppercase alphanumeric characters) and
   processed_in_ms (current time minus meta.submitted_at, in milliseconds) — and
   output a single object shaped as { "result": { ...all the fields... } }.

4. A Supabase node that inserts the lead into a table named "demo_leads".

5. A Switch node on result.tier: send "HOT" to a priority path and "WARM"/"COLD" to a
   standard path.

6. A Telegram node on each path that sends result.notification_message to a chat.

7. A "Respond to Webhook" node that returns the "Assemble" node's output as JSON with
   status 200.
```

That prompt gets you the skeleton. The two things AI builders most often fumble are
(a) the LLM returning clean JSON and (b) the Code-node expressions — Parts B and D
below nail both down.

---

## 2. PART B — The AI node's system prompt (the brain — paste verbatim)

Open the LLM node and paste this as its **System Message**:

```
You are the qualification engine for an inbound-lead intake system. You receive ONE
business inquiry and return ONE JSON object that scores and routes it. You serve
several industries — adapt to the "industry" field.

The submission text may be in English, Bengali, or Banglish (romanized Bengali).
Understand all three.

Return JSON ONLY — no markdown fences, no explanation — with EXACTLY these keys:
{
  "score": <integer 0-100>,
  "tier": "HOT" | "WARM" | "COLD",
  "urgency": "high" | "medium" | "low",
  "tags": [2-4 short lowercase tags like "urgent", "high-value", "wholesale"],
  "summary": "<one sentence: who they are + what they want + how strong>",
  "reasoning": "<one sentence: the main signals behind the score>",
  "routed_to": "<team/queue from the routing table below>",
  "recommended_action": "<the next best action>",
  "notification_channel": "<the client-facing channel — see channel table>",
  "notification_message": "<alert text, exact format below>"
}

SCORING — be decisive, use the whole range:
- Start around 50.
- ADD for: explicit urgency (a deadline, "today"/"ajke"/"kalke", emergency, court
  date), high commercial value (bulk/wholesale, large budget, high-value service or
  legal matter, project/heavy cargo, recurring volume), clear buying intent (ready to
  pay, wants to visit or book now, cash), and genuine detail/effort in the message.
- SUBTRACT for vague, tiny, or purely price-shopping inquiries with no specifics.
- tier: HOT if score >= 80, WARM if 62-79, COLD if below 62.
- urgency: "high" for a HOT lead or any explicit time pressure; "medium" for WARM;
  "low" otherwise.

ROUTING TABLE — choose routed_to from the industry + tier:
- fcommerce:  HOT "Order Desk (Priority)"   WARM "Order Desk"          COLD "Nurture / Follow-up"
- clinic:     HOT "Triage Nurse (Priority)" WARM "Front Desk — Booking" COLD "Front Desk — Booking"
- realestate: HOT "Senior Sales Agent"      WARM "Sales Team"          COLD "Long-term Nurture"
- legal:      HOT "Senior Partner"          WARM "Associate — Intake"  COLD "Intake Queue"
- logistics:  HOT "Project Cargo Desk"      WARM "Freight Quote Desk"  COLD "Quote Queue"
(Unknown industry: route sensibly to "Sales Team" / "Follow-up".)

notification_channel — the channel the client would actually use, by industry:
- fcommerce, clinic  -> "WhatsApp"
- realestate, logistics -> "Telegram"
- legal              -> "Email"
(In the demo the alert is physically delivered over Telegram to keep it free, but
this label shows the client what THEY would get in production. Don't mention Telegram
in the message text.)

recommended_action by tier:
- HOT:  "Contact within 15 minutes — do not queue."
- WARM: "Respond today with tailored options."
- COLD: "Add to nurture sequence; follow up in 48h."

notification_message — use this exact shape, with real line breaks:
🔔 New {TIER} lead — {industry as a human label, e.g. F-Commerce}
{name or company} ({phone or email, or "no contact"})
Interest: {main product / service / matter / cargo}
Score: {score}/100 · Route: {routed_to}
Action: {recommended_action}

Never invent facts that are not in the submission. Output JSON only.
```

For the node's **User Message**, pass the raw input so the model sees everything:

```
Industry: {{ $json.body.industry }}
Submission: {{ JSON.stringify($json.body.submission) }}
```

> **Reliability tip:** if your n8n version offers it, turn ON the LLM node's JSON /
> structured-output mode so it can't wrap the answer in prose. A **Basic LLM Chain**
> is more predictable here than a tools-style **AI Agent** — you don't need tools for
> scoring. If the builder gave you an AI Agent and the output is flaky, swap it.

---

## 3. PART C — Supabase table (run once in the SQL editor)

```sql
create table if not exists public.demo_leads (
  id                   bigint generated always as identity primary key,
  record_id            text unique,
  industry             text not null,
  lead_name            text,
  contact              text,
  score                int,
  tier                 text,
  urgency              text,
  tags                 text[],
  summary              text,
  reasoning            text,
  routed_to            text,
  recommended_action   text,
  notification_channel text,
  notification_message text,
  raw_submission       jsonb,
  created_at           timestamptz not null default now()
);
```

> Demo 4 (the Ops Command Center) will read this same table with Supabase Realtime —
> that's how a submit in Demo 1 makes a card appear live in Demo 4. One table, four
> demos. Keep the name `demo_leads`.

**Supabase Insert node — column → value mapping** (n8n expressions):

| column                 | value                                                    |
|------------------------|----------------------------------------------------------|
| `record_id`            | `{{ $json.result.record_id }}`                           |
| `industry`             | `{{ $('Webhook').first().json.body.industry }}`          |
| `lead_name`            | `{{ $('Webhook').first().json.body.submission.name || $('Webhook').first().json.body.submission.company }}` |
| `contact`              | `{{ $('Webhook').first().json.body.submission.phone || $('Webhook').first().json.body.submission.email }}` |
| `score`                | `{{ $json.result.score }}`                               |
| `tier`                 | `{{ $json.result.tier }}`                                |
| `urgency`              | `{{ $json.result.urgency }}`                             |
| `tags`                 | `{{ $json.result.tags }}`                                |
| `summary`              | `{{ $json.result.summary }}`                             |
| `reasoning`            | `{{ $json.result.reasoning }}`                           |
| `routed_to`            | `{{ $json.result.routed_to }}`                           |
| `recommended_action`   | `{{ $json.result.recommended_action }}`                  |
| `notification_channel` | `{{ $json.result.notification_channel }}`                |
| `notification_message` | `{{ $json.result.notification_message }}`                |
| `raw_submission`       | `{{ $('Webhook').first().json.body.submission }}`        |

> Zero-setup alternative for your very first test: swap the Supabase node for a
> **Google Sheets → Append Row** node. Same idea, no database to stand up. Move to
> Supabase before wiring Demo 4.

---

## 4. PART D — The Code "Assemble" node (paste verbatim)

This is the one piece of glue that must be exact. It handles the two runtime values
and the `{ result: ... }` wrapper, and it defensively parses the LLM output whether
it arrives as an object or a JSON string.

```js
// n8n Code node — "Assemble" — runs once per item
let ai = $json;

// LLM nodes sometimes return the JSON as a string under text/output/message.
for (const key of ['output', 'text', 'message', 'response']) {
  if (typeof ai[key] === 'string') {
    try { ai = JSON.parse(ai[key]); break; } catch { /* leave as-is */ }
  }
}
// Or the whole thing came back as a JSON string.
if (typeof ai === 'string') {
  try { ai = JSON.parse(ai); } catch { ai = {}; }
}

const input = $('Webhook').first().json.body || $('Webhook').first().json;
const submittedAt = input && input.meta ? input.meta.submitted_at : null;

const processed_in_ms = submittedAt
  ? Math.max(300, Date.now() - new Date(submittedAt).getTime())
  : 1800;

const record_id = 'REC-' + Math.random().toString(36).slice(2, 8).toUpperCase();

return [{ json: { result: { ...ai, record_id, processed_in_ms } } }];
```

**Telegram node** — Text field: `{{ $json.result.notification_message }}`

**Respond to Webhook node** — Respond With: **JSON**, Body:
`{{ $('Assemble').item.json }}`
(References Assemble directly, so it returns the clean `{ result: {...} }` no matter
what Supabase or Telegram hand back.)

---

## 5. PART E — Go live (connect n8n to the site)

1. In the Webhook node, switch from **Test URL** to **Production URL** and copy it.
2. In the Next.js project, add to `.env.local`:
   ```
   N8N_INTAKE_WEBHOOK_URL=https://your-n8n-host/webhook/intake
   ```
3. Restart / redeploy. Submit the form at `/demos/intake`.
   - Badge shows **● LIVE (n8n)** → you're hitting the real engine.
   - Badge shows **● SIMULATED** → the bridge fell back to mock (webhook errored,
     timed out >15s, or the env var isn't set). Check the n8n execution log.

The site keeps the webhook URL **server-side** and never exposes it to the browser
(the page's Content-Security-Policy is `connect-src 'self'`, so the browser calls
`/api/demo/intake` on the same origin and that route forwards to n8n). Don't try to
call the n8n webhook from the browser — it's blocked by design, and this is the part
that makes it look professional.

---

## 6. Post-build checklist

- [ ] Webhook is **POST**, response mode **"Using Respond to Webhook node"**.
- [ ] LLM node has a working OpenAI-compatible credential (base URL + key). Model-
      agnostic — point it at OpenRouter / agentrouter / OpenAI / your own endpoint.
- [ ] LLM **System Message** = Part B. JSON/structured output ON if available.
- [ ] "Assemble" Code node pasted exactly (Part D).
- [ ] Supabase (or Sheets) credential connected; table `demo_leads` created (Part C).
- [ ] Telegram bot token + chat id set; test message arrives.
- [ ] Respond to Webhook returns `{{ $('Assemble').item.json }}` as JSON, 200.
- [ ] Hit the Production webhook once (curl below) → you get the full `result` JSON.
- [ ] `N8N_INTAKE_WEBHOOK_URL` set on the site → badge reads **LIVE (n8n)**.

### Quick curl test (before touching the site)

```bash
curl -sS -X POST 'https://your-n8n-host/webhook/intake' \
  -H 'Content-Type: application/json' \
  -d '{
    "industry": "clinic",
    "submission": {
      "name": "Mr. Karim Uddin",
      "phone": "+8801812345678",
      "service": "Cardiology",
      "preferred": "As soon as possible",
      "message": "My father (62) has chest pain and shortness of breath since morning. Need a cardiologist urgently today."
    },
    "meta": { "source": "demo", "submitted_at": "2026-08-25T10:00:00.000Z" }
  }'
```

Expect a HOT lead (~85+), `routed_to` = "Triage Nurse (Priority)", and a
`notification_message` you can read. If you get that back, the site will light up the
moment you set the env var.
