# Demo 4 — "Ops Command Center" — Go-Live Guide

**What flips it live:** create one PII-safe *view* over the table Demo 1
already writes, then set two env vars. No new n8n workflow, no new table —
the moment the env vars are present and the view has ≥ 1 row, the board's
badge changes from **● SIMULATED** to **● LIVE (Supabase)** with zero code
changes.

Until then the page runs a self-driving simulated stream, so the demo is
never broken while you set this up.

---

## The one-paragraph mental model

```
Demo 1 (n8n)  ──insert──▶  demo_leads (has PII)
                                 │
                                 │  a curated, PII-free VIEW
                                 ▼
                          demo_leads_public  ◀──reads── /api/demo/command-center  ◀──polls── the board
                          (industry, score,           (server-side, holds the key)   (browser, same-origin)
                           channel, created_at)
```

The browser never talks to Supabase. It polls our own
`/api/demo/command-center` route every ~3.2s; the route reads Supabase
server-side and returns only non-personal fields. This is deliberate —
the site's CSP is `connect-src 'self'`, so a browser→Supabase connection
(including Supabase Realtime) is blocked by design. Polling through the
same-origin bridge is the CSP-safe equivalent.

> **Prerequisite:** Demo 1 must be writing to the **Supabase** node (not the
> Google-Sheets fallback). Demo 4 reads whatever Demo 1 stores.

---

## Step 1 — Create the PII-safe view

Supabase → **SQL Editor** → run this. It exposes *only* the five
non-personal columns the board needs. Names, contacts, summaries, the raw
submission JSON, and the notification text (which contains the name and
phone) are never selected, so they can never reach the browser.

```sql
-- A curated, non-personal projection of demo_leads for the public board.
-- security_invoker = false → the view reads the base table as its owner,
-- so we can keep the base table locked to the anon role (Step 2).
create or replace view public.demo_leads_public
  with (security_invoker = false) as
select
  coalesce(record_id, id::text) as id,   -- opaque, non-personal id
  industry,                              -- e.g. 'fcommerce'
  score,                                 -- 0–100
  notification_channel as channel_label, -- e.g. 'WhatsApp' (routing, not a person)
  created_at
from public.demo_leads;
```

Sanity-check it (run as the SQL editor, i.e. the owner):

```sql
select * from public.demo_leads_public order by created_at desc limit 3;
```

You should see only `id, industry, score, channel_label, created_at`.

---

## Step 2 — Lock the base table, expose only the view

This guarantees that even the key we hand the bridge can read *only* the
safe view — never the PII table — regardless of what column name someone
later points the bridge at.

```sql
-- Lock the PII table against the API roles.
alter table public.demo_leads enable row level security;
revoke select on public.demo_leads from anon, authenticated;

-- Expose ONLY the curated view to the bridge's role.
grant select on public.demo_leads_public to anon;
```

> **Does this break Demo 1's inserts?** No. n8n's Supabase node uses the
> project's **service_role** key, which bypasses RLS — inserts keep working.
> (If, unusually, your n8n inserts with the anon key, add an INSERT policy
> for anon on `demo_leads`; most setups don't need this.)

---

## Step 3 — Set the environment variables

Add these to the site's **existing** `.env.local` (don't overwrite the
other secrets already in it), and to **Vercel → Settings → Environment
Variables** (Production + Preview) for the deployed site.

```bash
SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
SUPABASE_KEY=YOUR-ANON-PUBLIC-KEY
# optional — this is already the default:
SUPABASE_LEADS_TABLE=demo_leads_public
```

Find both under Supabase → **Project Settings → API**:
`Project URL` and the **`anon` `public`** key (the row labelled *anon*).

> **Use the `anon` key, not `service_role` — on purpose.** The bridge keeps
> the key server-side either way, but least-privilege still applies: if the
> anon key ever leaks, it can read only the PII-free view (the base table is
> RLS-locked in Step 2). The `service_role` key bypasses *all* RLS, so a
> leak would expose everything — don't put it here.

After editing `.env.local`, restart `npm run dev`. On Vercel, **redeploy**
so the new env vars are picked up.

---

## Step 4 — Verify it's actually live

**a) The safe view is readable with the anon key** (fill in your ref + key):

```bash
curl -s "https://YOUR-PROJECT-REF.supabase.co/rest/v1/demo_leads_public?select=*&order=created_at.desc&limit=3" \
  -H "apikey: YOUR-ANON-PUBLIC-KEY" -H "Authorization: Bearer YOUR-ANON-PUBLIC-KEY"
```

Expect a small JSON array of `{id, industry, score, channel_label, created_at}`.

**b) The PII table is NOT readable with that key** (the privacy check):

```bash
curl -s "https://YOUR-PROJECT-REF.supabase.co/rest/v1/demo_leads?select=*&limit=1" \
  -H "apikey: YOUR-ANON-PUBLIC-KEY" -H "Authorization: Bearer YOUR-ANON-PUBLIC-KEY"
```

Expect `[]` (RLS returns no rows) or a permission error — **never** rows
with names/contacts. If you see PII here, Step 2 didn't take; re-run it.

**c) The site bridge reports live:**

```bash
curl -s http://localhost:3000/api/demo/command-center | grep -o '"mode":"[a-z]*"'
```

Expect `"mode":"live"` once at least one lead exists. (With an empty table
it stays `"mode":"simulated"` — the board never shows an empty screen.)

**d) The board itself:** open `/demos/command-center`. The badge reads
**● LIVE (Supabase)**, and submitting a lead through Demo 1 makes a new card
appear at the top of the feed within a few seconds.

---

## What the board shows (and never shows)

| Shown (non-personal)                    | Never leaves the server            |
|-----------------------------------------|------------------------------------|
| Industry (e.g. F-commerce)              | Submitter name (`lead_name`)       |
| Score 0–100 + HOT/WARM/COLD             | Contact / phone / email (`contact`)|
| Routed channel (e.g. WhatsApp)          | Summary text (`summary`)           |
| Time received                           | Notification message, raw JSON     |

Two layers enforce this: the **view** only selects safe columns, and the
**bridge route** independently maps only an allow-list of non-PII fields —
so PII can't leak even if the view is later changed.

---

## Troubleshooting

- **Badge stuck on SIMULATED** → env vars missing/typo'd, dev server not
  restarted (or Vercel not redeployed), or the table genuinely has 0 rows.
  Run Step 4c: if it errors, it's env; if it's `simulated` with a populated
  table, re-check the URL/key.
- **`live` but the feed is empty** → the view exists but returns nothing;
  confirm Demo 1 is inserting into Supabase (Step 4a).
- **PII visible in Step 4b** → RLS/grant didn't apply. Re-run Step 2; make
  sure you ran it against the right project.
- **Realtime confusion** → the Demo 1 kit mentions Supabase Realtime; we
  intentionally poll through the bridge instead (CSP forbids a direct
  browser→Supabase socket). Nothing to configure — polling is built in.
