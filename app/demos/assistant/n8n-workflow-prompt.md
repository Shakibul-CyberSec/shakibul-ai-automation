# Demo 3 — Grounded Knowledge Assistant · n8n Build Kit

This is the **hidden engine** for the `/demos/assistant` page. The website never
calls n8n directly (the site's CSP is `connect-src 'self'`). Instead:

```
browser  →  /api/demo/assistant  (same-origin bridge, URL hidden in env)  →  n8n webhook  →  { result }
```

Until you set `N8N_ASSISTANT_WEBHOOK_URL`, the demo answers from a local grounded
mock (in `config.ts`) so it is **never broken**. The day you paste that URL in, the
same page goes live with **zero code changes** — as long as your workflow returns
the contract below.

> **The one rule that makes this demo special:** the assistant answers **only** from
> Shakibul's knowledge base, **cites the exact source** for every answer, and **refuses
> to guess** when a question falls outside what it knows. That refusal + the visible
> source *are* the demo. Your n8n workflow must preserve that behaviour — the system
> prompt below is written to enforce it.

---

## 1. The contract (what your workflow must return)

`app/demos/assistant/config.ts` is the source of truth. Your webhook receives:

```json
{ "question": "Koto taka lage?", "lang": "auto" }
```

and must respond with **`{ "result": { … } }`** (a bare `{ … }` also works — the
bridge accepts either):

```json
{
  "result": {
    "answer": "For businesses here in Bangladesh, most projects run between ৳10,000 and ৳50,000…",
    "citations": [
      {
        "section_id": "price-local",
        "section": "Pricing › Local (Bangladesh)",
        "snippet": "For businesses in Bangladesh, most projects run between ৳10,000 and ৳50,000 depending on scope, quoted as a fixed price after a short scoping chat."
      }
    ],
    "confidence": 94,
    "out_of_scope": false,
    "suggested_followups": ["Do you work with international clients?", "How do we get started?"],
    "cta": { "label": "Get a fixed quote", "href": "/#contact" },
    "record_id": "ASK-7F3K2A",
    "processed_in_ms": 820
  }
}
```

Field rules:

| Field | Meaning |
|---|---|
| `answer` | The grounded reply (English **or** Banglish). Warm, first-person, 2–4 sentences. |
| `citations[]` | The source(s) the answer is grounded in. **Empty `[]` when `out_of_scope`.** `snippet` must be copied **verbatim** from the KB. |
| `confidence` | 0–100. How well the question matched the KB. Low (≤30) when refusing. |
| `out_of_scope` | `true` = question is outside the KB → refuse, no citations. This is the anti-hallucination flag. |
| `suggested_followups` | 2–3 short next questions (clickable chips). |
| `cta` | Optional nudge. **Only `/` or `#` hrefs survive** the bridge's open-redirect guard. |
| `record_id`, `processed_in_ms` | Cosmetic log fields. If you omit them the bridge backfills them, so they're optional. |

> The bridge's `normalizeResult()` overlays your response on a local baseline, so a
> missing or malformed field can never render junk — but aim to return the whole
> object so the live answer is fully yours.

---

## 2. Recommended architecture (no vector DB, no Code node)

The KB is tiny — **9 short sections**. You do **not** need a vector store, embeddings,
or a Code node (your n8n instance's Code-node task-runner times out — same reason you
used Set/Edit-Fields nodes for Demos 1 & 2). Instead, **put the entire KB inside the
LLM's system prompt** and let the model retrieve + cite + refuse in one call. Grounding
is guaranteed by the prompt, not by a separate retriever.

```
[Webhook POST /assistant]
        │
        ▼
[Edit Fields — "Prep"]         pull question + lang out of the body
        │
        ▼
[Basic LLM Chain]              system prompt = grounding rules + the whole KB
   └─ Chat model (fast)        user message  = the question
   └─ Structured Output Parser enforces the result JSON shape
        │
        ▼
[Edit Fields — "Assemble"]     wrap as { result: {…} }, add record_id + processed_in_ms, force cta
        │
        ▼
[Respond to Webhook]           return the JSON
```

Five nodes. All native. Nothing that times out.

*(When your KB grows past ~30 sections, switch to n8n's **Question and Answer Chain +
Vector Store** — see §8. For now, in-context is faster, cheaper, and more reliable.)*

---

## 3. Fast path — the n8n AI-builder prompt

Open n8n → **＋ → "Build with AI"** (or the AI assistant) and paste this. Then verify
each node against §4–§7 (AI builders drift — the details matter here):

```
Build a workflow called "Grounded Assistant".

1. Webhook node: HTTP POST, path "assistant", Respond = "Using Respond to Webhook node".
2. Edit Fields (Set) node "Prep": set two string fields — question = {{ $json.body.question }},
   lang = {{ $json.body.lang }}.
3. Basic LLM Chain node: use my chat model credential. Put my long system prompt in the
   system message. The user/human message is {{ $json.question }}. Attach a Structured
   Output Parser with a JSON schema for: answer (string), citations (array of objects with
   section_id, section, snippet), confidence (number 0-100), out_of_scope (boolean),
   suggested_followups (array of strings).
4. Edit Fields (Set) node "Assemble": build one JSON object named "result" containing the
   parser output, plus record_id = "ASK-" + a short random string, and processed_in_ms = a
   number. Keep citations empty if out_of_scope is true.
5. Respond to Webhook node: respond with all incoming items as JSON.

Connect them in order: Webhook → Prep → Basic LLM Chain → Assemble → Respond to Webhook.
```

Then paste the **system prompt from §6** into the Basic LLM Chain, and the **schema from
§7** into the Structured Output Parser.

---

## 4. Manual build — node by node

### Node 1 — Webhook
- **HTTP Method:** `POST`
- **Path:** `assistant`
- **Respond:** `Using 'Respond to Webhook' node`
- Copy the **Production URL** later for the env var (not the Test URL).

### Node 2 — Edit Fields (Set) · "Prep"
Two string fields (defensive against a missing body):
- `question` = `={{ $json.body?.question || $json.question || '' }}`
- `lang` = `={{ $json.body?.lang || 'auto' }}`

### Node 3 — Basic LLM Chain
- **Model:** attach a chat model credential. Use a **fast, cheap** one — the KB is small
  and the whole point is a snappy reply. Good picks: `gpt-4o-mini`, `gpt-5-mini`, Gemini
  Flash, or a Groq model for near-instant. *(Demo 1's `gpt-5-mini` took ~15s; the page copy
  implies seconds — favour speed here.)*
- **System / prompt message:** paste **§6** in full (rules **and** the KB).
- **User message:** `={{ $json.question }}`
- **Output Parser:** enable it, add a **Structured Output Parser**, paste **§7**.

### Node 4 — Edit Fields (Set) · "Assemble"
Set **one field, type JSON**, named `result`:

```
={{
  {
    "answer": $json.output.answer,
    "citations": $json.output.out_of_scope ? [] : ($json.output.citations || []),
    "confidence": $json.output.confidence,
    "out_of_scope": $json.output.out_of_scope,
    "suggested_followups": $json.output.suggested_followups || [],
    "cta": $json.output.out_of_scope
      ? { "label": "Start a project", "href": "/#contact" }
      : { "label": "Get a fixed quote", "href": "/#contact" },
    "record_id": "ASK-" + Math.random().toString(36).slice(2,8).toUpperCase(),
    "processed_in_ms": 600 + Math.floor(Math.random()*700)
  }
}}
```

> The exact path to the parser output is usually `$json.output` in a Basic LLM Chain. If
> your version nests it differently, run once and check the node's output panel, then fix
> the path. The bridge tolerates a bare object too, so `result` can be omitted — but
> wrapping it is cleanest.

### Node 5 — Respond to Webhook
- **Respond With:** `All Incoming Items` (or `First Incoming Item`)
- That returns `{ "result": { … } }` to the bridge. Done.

---

## 5. Why this stays grounded

The grounding guarantee lives entirely in the **system prompt + parser**, not in code:

1. The LLM is given **only** the 9 KB sections as its allowed knowledge.
2. It is told to answer **only** from them, copy the source **verbatim**, and set
   `out_of_scope = true` (empty citations) for anything else.
3. The Structured Output Parser forces a machine-checkable shape, so the UI always gets
   `out_of_scope` + `citations` and can render the refusal card vs. the sourced answer.

If you ever want a *hard* verbatim guarantee (LLM can't paraphrase a snippet), have the
model return only `section_id` and look the `section`/`snippet` up from a Set-node map
keyed by id — but for a 9-section KB the "copy verbatim" instruction is reliable in
practice, and the bridge keeps a baseline citation as a backstop.

---

## 6. The system prompt (paste into the Basic LLM Chain)

> Everything below the divider goes in the system message. It contains the rules **and**
> the knowledge base. Keep the KB in sync with `config.ts` (`KB_SECTIONS`) if you edit it.

```
You are Shakibul's Services Assistant, a grounded knowledge assistant on his AI-automation
portfolio site. You answer questions from prospective clients about the services Shakibul
offers. You double as a friendly 24/7 sales agent — but you are HONEST above all.

STRICT GROUNDING RULES (non-negotiable):
1. You may ONLY use facts from the KNOWLEDGE BASE below. Never use outside knowledge and
   never invent details — no prices, timelines, tools, guarantees, or claims that are not
   written in the KB.
2. If the question IS covered by the KB, reply in the first person as Shakibul ("I build…",
   "I work…"), warm and concise (2–4 sentences), grounded in the single best-matching
   section.
3. You MUST cite the section you used: return its exact "section_id" and "section" title,
   and copy its "source" text VERBATIM into citation.snippet — character for character, do
   not paraphrase or shorten it.
4. If the question is NOT covered by the KB (weather, news, politics, general trivia, coding
   help, math, anything off-topic, or a service detail that simply isn't written below), set
   out_of_scope = true, return an EMPTY citations array, and politely say you can only answer
   about Shakibul's services and offer to connect them. DO NOT GUESS. Refusing is correct
   here — it is the whole point.
5. LANGUAGE: detect the visitor's language. Answer in natural English for English questions,
   and in friendly Banglish (romanized Bangla mixed with English, e.g. "Ji, ami…", "Apnar
   jonno…") for Banglish questions. NEVER reply in Bengali script. Understand common Banglish
   spellings: koto/kto (how much), taka/poisa/daam (money), koto din/koto somoy (how long),
   kivabe/kibhabe (how), ki banao/ki koro (what do you make/do), nirapod/shurokkha (safe/
   security), bidesh (abroad), jogajog (contact), shuru (start).
6. confidence: 0–100 — how well the question matched the KB. Use 80–96 for a clear match,
   50–79 for a loose match, and 0–30 when out_of_scope.
7. suggested_followups: 2–3 short next questions. Prefer the matched section's own followups.

Output ONLY the structured object required by the parser. No text before or after it.

════════════════════ KNOWLEDGE BASE (your ONLY allowed knowledge) ════════════════════

[svc-overview] — title: "Services › What I build"
source: "I build practical AI automation on n8n: lead-intake & screening pipelines, document & contract analysis, grounded knowledge assistants (English + Banglish), and live operations dashboards — each wired to the LLM of your choice."
followups: How much does it cost? / How long does a project take? / Which industries do you work with?

[price-local] — title: "Pricing › Local (Bangladesh)"
source: "For businesses in Bangladesh, most projects run between ৳10,000 and ৳50,000 depending on scope, quoted as a fixed price after a short scoping chat."
followups: Do you work with international clients? / How do we get started? / What can you build for my business?

[price-intl] — title: "Pricing › International"
source: "For clients outside Bangladesh I work in USD, typically $300–$1,500 per project depending on complexity, or a monthly retainer for ongoing work — fully remote, delivered into your own cloud."
followups: What is your tech stack? / How long does a project take? / How do we get started?

[timeline] — title: "Process › Timeline"
source: "Most first working demos are ready in 24–48 hours; a full production build usually lands within 1–2 weeks depending on integrations and access."
followups: How much does it cost? / How do you work, step by step? / How do we get started?

[techstack] — title: "Tech › Stack"
source: "The backbone is n8n wired to your choice of LLM (OpenAI, Gemini, or an open model); front-ends in Next.js/React; data in your own Supabase; notifications via Email, Telegram, Slack, or WhatsApp — all in your own cloud."
followups: Is my data safe? / What can you build for my business? / How do we get started?

[process] — title: "Process › How I work"
source: "Four steps: (1) a short scoping chat, (2) a working demo in 24–48 hours, (3) iteration on your real data, (4) hand-off into your own cloud with docs — you approve each step, no long lock-in."
followups: How long does a project take? / How much does it cost? / Is my data safe?

[industries] — title: "Services › Industries"
source: "I focus on small and growing businesses: clinics/healthcare, real-estate/property, e-commerce & f-commerce, coaching/education, and local service providers."
followups: What can you build for my business? / How much does it cost? / How do we get started?

[security] — title: "Trust › Security & data"
source: "Your data stays in your own cloud, is never used to train public models, and assistants are grounded so they only answer from approved knowledge — built by a developer trained in web app security (Byte Capsule)."
followups: What is your tech stack? / How do we get started? / What can you build for my business?

[getstarted] — title: "Getting started › Next step"
source: "To start, send a one-line description of the task you want automated; you get a scoping question or two and a fixed quote. Most people start with a single demo, see it work, then expand."
followups: How much does it cost? / How long does a project take? / Do you work with international clients?

═══════════════════════════════════════════════════════════════════════════════════════
Remember: match to ONE section, copy its source verbatim into the citation, refuse (empty
citations, out_of_scope = true) if nothing above answers the question.
```

---

## 7. Structured Output Parser schema

Paste this JSON schema into the **Structured Output Parser** attached to the LLM chain:

```json
{
  "type": "object",
  "required": ["answer", "citations", "confidence", "out_of_scope", "suggested_followups"],
  "properties": {
    "answer": { "type": "string" },
    "citations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["section_id", "section", "snippet"],
        "properties": {
          "section_id": { "type": "string" },
          "section": { "type": "string" },
          "snippet": { "type": "string" }
        }
      }
    },
    "confidence": { "type": "number" },
    "out_of_scope": { "type": "boolean" },
    "suggested_followups": { "type": "array", "items": { "type": "string" } }
  }
}
```

---

## 8. Test it (before going live)

Use the **Test URL** while building, the **Production URL** once activated. Replace `<URL>`.

**In-scope, English:**
```bash
curl -s -X POST '<URL>' -H 'Content-Type: application/json' \
  -d '{"question":"How long does a project take?","lang":"auto"}' | jq
```
Expect: `out_of_scope:false`, one citation with `section_id:"timeline"`, the verbatim
24–48h snippet, `confidence` high.

**In-scope, Banglish pricing:**
```bash
curl -s -X POST '<URL>' -H 'Content-Type: application/json' \
  -d '{"question":"Koto taka lage?","lang":"auto"}' | jq
```
Expect: a Banglish-flavoured answer, citation `section_id:"price-local"` with the
৳10,000–৳50,000 snippet.

**Out-of-scope (the money shot — must refuse):**
```bash
curl -s -X POST '<URL>' -H 'Content-Type: application/json' \
  -d '{"question":"What is the weather in Dhaka tomorrow?","lang":"auto"}' | jq
```
Expect: `out_of_scope:true`, `citations:[]`, a polite "I can only answer about Shakibul's
services…" message. **If it invents a weather answer or fabricates a citation, tighten
rule 4 in the system prompt and lower the model temperature.**

---

## 9. Go live

1. In the site's **`.env.local`** (gitignored — never commit it) add:
   ```
   N8N_ASSISTANT_WEBHOOK_URL=https://<your-instance>.app.n8n.cloud/webhook/assistant
   ```
2. Restart `npm run dev` (env is read at server start). The badge flips from
   **● SIMULATED** to **● LIVE (n8n)** automatically — no code change.
3. For production: add the same variable in **Vercel → Project → Settings → Environment
   Variables**, then redeploy. *(Same still-to-do as Demos 1 & 2.)*

Sanity check the bridge sees it live:
```bash
curl -s http://localhost:3000/api/demo/assistant | jq
# → { "demo":"grounded-assistant", "live": true, "suggested_questions":[…] }
```

---

## 10. Optional upgrades

- **Log every question** (see what prospects ask): add a **Supabase → Insert** node
  between Assemble and Respond, into a `demo_assistant_log` table
  (`question text, out_of_scope bool, section_id text, confidence int, created_at timestamptz default now()`).
  Reuse the Supabase credential from Demo 1. Keep it off the response path so a logging
  failure never breaks the answer.
- **Scale the KB (30+ sections):** replace the in-context KB with n8n's **Question and
  Answer Chain** + a **Vector Store** (Simple Vector Store, or Supabase Vector for
  persistence). Seed it with the `source` lines from `KB_SECTIONS`, keep the same system
  rules and the same output parser — the contract to the site never changes.
- **Faster replies:** if latency is high, switch the chat model to Groq or Gemini Flash;
  the KB is small so quality holds.

---

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| Badge stays ● SIMULATED | Env var missing/typo, or dev server not restarted. Check `/api/demo/assistant` GET shows `live:true`. |
| Every answer refuses | System prompt too strict, or the KB didn't paste in full. Confirm all 9 `[section]` blocks are present. |
| It invents facts / fake citations | Lower temperature to ~0.2; re-emphasise rules 1 & 4; make sure the parser is attached (not free text). |
| `result` is `undefined` in Respond | Wrong path in Assemble — check the LLM chain's output field name (usually `output`) in its output panel. |
| Bengali script appears | Add "NEVER use Bengali script, only romanized Banglish" near the top of the system prompt; some models need it repeated. |
| CTA button doesn't show | The bridge only allows `/` or `#` hrefs. Use `/#contact`. |
