# Demo 2 — "Contract X-Ray" — n8n Build Kit

This is everything you need to build the **hidden engine** for Demo 2 using n8n's
AI workflow builder. The Next.js side (the page the prospect sees, the API bridge,
the mock/sample fallback) is already done and already speaks the contract below.

**The moment you paste your n8n Production Webhook URL into the site's
`N8N_CONTRACT_WEBHOOK_URL` env var, the demo flips from SIMULATED to LIVE (n8n) with
zero code changes.** Until then the page runs on realistic pre-scored samples, so
nothing is ever broken while you build.

> Same trick as Demo 1: the prospect **never** sees n8n. They see a polished forensic
> report. n8n is the engine under the hood. Keep it that way.

---

## 0. The contract (non-negotiable — the frontend already depends on it)

### What n8n RECEIVES — two shapes, one webhook

**(a) A sample click** arrives as JSON. `text` is the full document text, already
extracted for you — just analyze it:

```json
{ "doc": "sla", "text": "MASTER SERVICE LEVEL AGREEMENT... (full contract text) ..." }
```

**(b) An uploaded PDF** arrives as `multipart/form-data` with a single binary field
named `file`. There is no `text` — you extract it from the PDF yourself.

So the very first decision in the workflow is: **is `text` present?** If yes, use it.
If no, run the PDF through an Extract node. Everything after that is identical.

### What n8n MUST RETURN (JSON, HTTP 200)

```json
{
  "result": {
    "doc_type": "Service Level Agreement",
    "doc_title": "Master SLA — Vendor Platform Services",
    "page_count": 22,
    "parties": [
      { "name": "Northwind Retail Ltd.", "role": "Customer" },
      { "name": "Apex Cloud Systems Inc.", "role": "Vendor" }
    ],
    "overall_risk": {
      "score": 81,
      "level": "HIGH",
      "headline": "Auto-renews for 24 months with uncapped liability on your side."
    },
    "summary": "A vendor-favourable SLA: automatic multi-year renewal, one-sided indemnity, and a credit-only remedy that caps the vendor's exposure while leaving yours open.",
    "findings": [
      {
        "id": "f-1",
        "severity": "high",
        "category": "Liability",
        "title": "Uncapped customer indemnification",
        "quote": "Customer shall indemnify and hold harmless the Vendor against any and all claims, without limitation as to amount.",
        "page": 14,
        "why": "Your liability is unlimited while the vendor's is capped at fees paid — a heavily one-sided allocation of risk.",
        "recommendation": "Negotiate a mutual indemnity and a liability cap tied to 12 months of fees."
      }
    ],
    "key_dates": [
      { "label": "Auto-renewal notice deadline", "date": "60 days before term end", "page": 3, "urgency": "high" }
    ],
    "key_terms": [
      { "label": "Initial term", "value": "24 months", "page": 3 },
      { "label": "Liability cap (Vendor)", "value": "Fees paid in prior 12 months", "page": 14 }
    ],
    "record_id": "REC-7QK2ND",
    "processed_in_ms": 1840
  }
}
```

**Field rules (match these names exactly):**

- `overall_risk.score` — integer 0–100. `level` — `"HIGH"` (≥70), `"MEDIUM"` (45–69),
  `"LOW"` (<45). `headline` — one sentence, the single most important takeaway.
- `findings[]` — each has `id`, `severity` (`"high" | "medium" | "low"`), `category`,
  `title`, `quote` (**verbatim from the document**), `page` (integer), `why`,
  `recommendation`. Aim for 3–6.
- `key_dates[]` — `label`, `date` (a string; relative like "60 days before term end"
  is fine), `page`, `urgency` (`"high" | "medium" | "low"`).
- `key_terms[]` — `label`, `value`, optional `page`. `parties[]` — `name`, `role`.
- `record_id`, `page_count`, `processed_in_ms` are added by the **Assemble** node.

Return the whole object. (The site has a safety net that back-fills anything missing
and clamps the score, but a complete response is what makes the demo shine.) A bare
object without the `result` wrapper also works — the bridge accepts both.

---

## 1. PART A — Paste this into n8n's AI builder ("Build with AI")

```
Build a workflow named "Demo 2 — Contract X-Ray". It reads a contract (either as
plain text or as an uploaded PDF) and returns a structured forensic risk report as
JSON, synchronously, to the caller.

Nodes, connected in this order:

1. Webhook (trigger). HTTP method POST, path "contract". Set the "Respond" option to
   "Using 'Respond to Webhook' node". It must accept BOTH a JSON body and a binary
   file upload. Two kinds of request arrive:
   (a) JSON: { "doc": "sla", "text": "<the full contract text>" }
   (b) multipart/form-data with one binary file field named "file" (a PDF).

2. An IF node: check whether the incoming text is present and non-empty
   (expression: the body's "text" field). TRUE → text was supplied, skip extraction.
   FALSE → it's a PDF upload, extract the text first.

3. On the FALSE branch: an "Extract from File" node, operation "Extract from PDF",
   reading the binary property "file". It outputs the document text.

4. Both branches feed a small "Edit Fields (Set)" node named "Prep" that produces one
   field, docText, holding the contract text truncated to the first 15000 characters
   (long contracts otherwise blow the model's context and slow the demo down).

5. A Basic LLM Chain node with an OpenAI-compatible Chat Model and a Structured Output
   Parser attached. Feed it docText. It must return ONLY a JSON object describing the
   contract's risk — use the system prompt and schema I will paste into this node.

6. An "Edit Fields (Set)" node named "Assemble" that takes the parsed model output,
   adds record_id, page_count, and processed_in_ms, and wraps everything as
   { "result": { ...all the fields... } }. (Use a Set node, not a Code node.)

7. (Optional) A Supabase node that inserts a summary row into a table "demo_contracts".

8. A "Respond to Webhook" node that returns the Assemble node's output as JSON, 200.
```

That prompt gets you the skeleton. The two things AI builders fumble are (a) the LLM
returning clean, schema-valid JSON and (b) the extract + assemble glue — Parts B, C
and D below nail those down.

---

## 2. PART B — The forensic AI node's system prompt (the brain — paste verbatim)

Open the LLM node and paste this as its **System Message**:

```
You are a senior contracts analyst performing a forensic risk review of ONE
document. You return ONE JSON object. You are precise, sceptical, and you never
invent text that is not in the document.

The document may be an SLA, NDA, lease, distribution/vendor agreement, employment
contract, or similar. It may be written in English, Bengali, or Banglish (romanized
Bengali). Understand all three.

Return JSON ONLY — no markdown fences, no commentary — with EXACTLY these keys:
{
  "doc_type": "<e.g. 'Service Level Agreement', 'Non-Disclosure Agreement'>",
  "doc_title": "<a short human title for this specific document>",
  "parties": [ { "name": "<party name>", "role": "<e.g. Customer, Vendor, Landlord>" } ],
  "overall_risk": {
    "score": <integer 0-100>,
    "level": "HIGH" | "MEDIUM" | "LOW",
    "headline": "<one sentence: the single most important risk takeaway>"
  },
  "summary": "<2-3 sentences: what this contract is and where the risk sits>",
  "findings": [
    {
      "id": "f-1",
      "severity": "high" | "medium" | "low",
      "category": "<e.g. Liability, Termination, Payment, IP, Confidentiality, Renewal>",
      "title": "<short label for the issue>",
      "quote": "<the EXACT clause text from the document that triggered this>",
      "page": <integer page number, or 0 if unknown>,
      "why": "<one sentence: why this matters to the reader>",
      "recommendation": "<one sentence: what to do about it>"
    }
  ],
  "key_dates": [
    { "label": "<e.g. Renewal notice deadline>", "date": "<date or relative period>", "page": <int>, "urgency": "high" | "medium" | "low" }
  ],
  "key_terms": [
    { "label": "<e.g. Initial term>", "value": "<e.g. 24 months>", "page": <int> }
  ]
}

SCORING — be decisive, use the whole range:
- Start around 40 for a balanced, mutual, well-drafted contract.
- ADD for one-sided risk to the reader: uncapped or one-way liability/indemnity,
  automatic renewal with a long notice window, unilateral termination or price-change
  rights for the counterparty, broad IP assignment, weak or one-way confidentiality,
  penalties/liquidated damages against the reader, governing law/venue that is
  hostile or inconvenient, missing protections a reasonable party would expect.
- SUBTRACT for mutual, capped, clearly-bounded terms and standard market language.
- level: HIGH if score >= 70, MEDIUM if 45-69, LOW if below 45.

FINDINGS — 3 to 6, ordered most severe first:
- Every finding's "quote" MUST be copied verbatim from the document. Do NOT paraphrase
  in the quote field and do NOT invent a clause. If the document text is truncated and
  you cannot see a clause, do not fabricate one.
- If an expected protection is ABSENT (e.g. there is no liability cap at all), that is
  a valid finding — set the quote to a short note like "No liability cap present in
  the reviewed text." and say so in "why".
- Assign severity honestly: "high" = could cost real money or lose key rights;
  "medium" = meaningful but negotiable; "low" = worth noting.

Never invent facts, parties, dates, or clauses. If something isn't in the text, leave
it out or mark it absent. Output JSON only.
```

For the node's **User Message**, pass the prepared text:

```
Review the following contract text and return the risk JSON.

{{ $json.docText }}
```

> **Reliability + speed tip:** attach a **Structured Output Parser** to the Basic LLM
> Chain and paste the schema above into it — that forces clean JSON and gives you a
> real object at `$json.output` (no string-parsing needed downstream). A **Basic LLM
> Chain** is more predictable here than a tools-style **AI Agent** — you don't need
> tools for this.

---

## 3. PART C — PDF extraction + model choice

**Extract from File node** (the FALSE / upload branch):
- Operation: **Extract from PDF** (some n8n versions label it "Extract From File" with
  a PDF option).
- Input Binary Field: **`file`** (this is the exact field name the site sends).
- It outputs the document text (commonly under `text`) and, depending on version, a
  page count (`numpages` / `pageCount`). The "Prep" Set node reads whichever text
  field is present.

**The "Prep" Set node** — one field, mode "Manual Mapping":
- Field name: `docText`, type String, value (expression):
  ```
  {{ ($json.body && $json.body.text) || $json.text || '' }}
  ```
  then cap it: wrap as `{{ (((...)) || '').slice(0, 15000) }}` — i.e.
  ```
  {{ (($json.body && $json.body.text) || $json.text || '').slice(0, 15000) }}
  ```
  The 15000-char cap keeps long contracts fast and cheap; the analyst prompt already
  knows the text may be truncated and is told not to invent missing clauses.

**Model choice — learn from Demo 1.** Demo 1 felt slow (~15s) because of a heavy
model. This demo sends more text, so pick a **fast, cheap, long-context** model and
keep latency under the site's 15s bridge timeout:
- Good picks: `gpt-5-mini`, `gpt-4.1-mini`, Gemini 1.5/2.0 **Flash**, or a fast hosted
  Llama-3.x-70B via OpenRouter. Point the Chat Model's base URL + key at whatever
  OpenAI-compatible endpoint you use (OpenRouter / agentrouter / OpenAI / your own).
- Turn ON JSON / structured output. Keep `max_tokens` generous enough for 3–6 findings
  (~1200+).

---

## 4. PART D — The "Assemble" Set node (paste verbatim)

Use an **Edit Fields (Set)** node, **not** a Code node — Set-node expressions run in
n8n's expression engine and sidestep the Code-node task-runner outages some n8n Cloud
instances hit.

Configure the Set node like this:
- **Mode:** Manual Mapping
- **Include Other Input Fields:** OFF (we output only `result`)
- Add ONE field named **`result`**, type **Object**, value (expression):

```
{{ {
  ...$json.output,
  record_id: 'REC-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
  page_count: ($json.output && $json.output.page_count) || $('Extract from File').first().json.numpages || $('Extract from File').first().json.pageCount || 0,
  processed_in_ms: Math.round(1000 + Math.random() * 1500)
} }}
```

- `...$json.output` spreads everything the model returned (via the Structured Output
  Parser). If you did **not** attach a parser and the model output is a raw string,
  replace `$json.output` with `JSON.parse($json.text)` in both places.
- `page_count` prefers the model's own count, then the PDF extractor's, then 0. (On a
  sample/text request there is no Extract node in the path — the model's `page_count`
  or the site's baseline fills it, so a missing Extract reference is fine.)

**Respond to Webhook node** — Respond With: **JSON**, Body:
```
{{ { result: $('Assemble').item.json.result } }}
```
(References Assemble directly, so it returns the clean `{ result: {...} }` no matter
what Supabase hands back.)

---

## 5. PART E — Supabase (optional, off the response path)

Only if you want to log analyses (and later surface them in Demo 4). Run once:

```sql
create table if not exists public.demo_contracts (
  id             bigint generated always as identity primary key,
  record_id      text unique,
  doc_type       text,
  doc_title      text,
  page_count     int,
  risk_score     int,
  risk_level     text,
  headline       text,
  findings_count int,
  created_at     timestamptz not null default now()
);
```

**Supabase Insert node — column → value mapping:**

| column           | value                                             |
|------------------|---------------------------------------------------|
| `record_id`      | `{{ $json.result.record_id }}`                    |
| `doc_type`       | `{{ $json.result.doc_type }}`                     |
| `doc_title`      | `{{ $json.result.doc_title }}`                    |
| `page_count`     | `{{ $json.result.page_count }}`                   |
| `risk_score`     | `{{ $json.result.overall_risk.score }}`           |
| `risk_level`     | `{{ $json.result.overall_risk.level }}`           |
| `headline`       | `{{ $json.result.overall_risk.headline }}`        |
| `findings_count` | `{{ $json.result.findings.length }}`              |

> Keep it **after** you've captured the result and **before** Respond, or on a side
> branch — never let a Supabase hiccup block the HTTP response. Skip this entirely for
> your first working version.

---

## 6. PART F — Go live (connect n8n to the site)

1. In the Webhook node, switch from **Test URL** to **Production URL** and copy it.
2. In the Next.js project, add to `.env.local`:
   ```
   N8N_CONTRACT_WEBHOOK_URL=https://your-n8n-host/webhook/contract
   ```
3. Restart / redeploy. Open `/demos/contract` and click a sample.
   - Badge shows **● LIVE (n8n)** → you're hitting the real engine.
   - Badge shows **● SIMULATED** → the bridge fell back (webhook errored, timed out
     >15s, or the env var isn't set). Check the n8n execution log.

The site keeps the webhook URL **server-side** and never exposes it to the browser
(the page's Content-Security-Policy is `connect-src 'self'`, so the browser calls
`/api/demo/contract` on the same origin and that route forwards to n8n). Don't try to
call the n8n webhook from the browser — it's blocked by design.

---

## 7. Post-build checklist

- [ ] Webhook is **POST**, path `contract`, response mode **"Using Respond to Webhook node"**.
- [ ] IF node correctly splits "text present" (sample) vs "PDF upload".
- [ ] Extract from File reads binary property **`file`**; Prep caps `docText` to 15000 chars.
- [ ] LLM node **System Message** = Part B, with a Structured Output Parser + JSON mode ON.
- [ ] Model is a **fast** long-context model (keep total round-trip < 15s).
- [ ] "Assemble" **Set** node pasted exactly (Part D); outputs `{ result: {...} }`.
- [ ] Respond to Webhook returns the `{ result }` object as JSON, 200.
- [ ] Both curl tests below pass.
- [ ] `N8N_CONTRACT_WEBHOOK_URL` set on the site → badge reads **LIVE (n8n)**.

### Quick curl tests (before touching the site)

**(a) Sample / text path:**
```bash
curl -sS -X POST 'https://your-n8n-host/webhook/contract' \
  -H 'Content-Type: application/json' \
  -d '{
    "doc": "sla",
    "text": "MASTER SERVICE LEVEL AGREEMENT. Initial term of twenty-four (24) months, automatically renewing for successive 12-month terms unless either party gives written notice at least sixty (60) days before the end of the then-current term. Customer shall indemnify and hold harmless the Vendor against any and all claims without limitation as to amount. Vendors total liability shall not exceed the fees paid in the prior twelve (12) months. Service credits are the Customers sole and exclusive remedy for any failure to meet the service levels."
  }'
```
Expect a HIGH-risk result (~75–85), an "Auto-renewal" key date, an uncapped-indemnity
finding with a verbatim quote, and a readable headline.

**(b) PDF upload path:**
```bash
curl -sS -X POST 'https://your-n8n-host/webhook/contract' \
  -F 'file=@/path/to/any-contract.pdf'
```
Expect the same shape, with `page_count` reflecting the real PDF. If both come back
with a full `result` object, the site will light up the moment you set the env var.
