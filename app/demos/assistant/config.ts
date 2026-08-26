/* ═══════════════════════════════════════════════════════════════
   DEMO 3 — GROUNDED KNOWLEDGE ASSISTANT
   Shared config + data contract (framework-neutral: imported by both
   the client page and the server API route).

   THIS FILE IS THE SPINE. The n8n workflow you build must accept a
   question (`{ question, lang }`) and return an `AssistantResult`
   exactly. The frontend and the grounded mock engine below already
   speak this contract, so the day you set N8N_ASSISTANT_WEBHOOK_URL
   the demo goes live with zero code changes.

   The knowledge base here is YOUR OWN SERVICES — so the assistant
   doubles as a 24/7 sales agent. Every answer is grounded in a KB
   section and cites it; anything outside the KB is refused, never
   invented. That refusal + citation IS the demo.
   ═══════════════════════════════════════════════════════════════ */

/* ---------- DATA CONTRACT (frontend <-> n8n) ---------- */

export interface Citation {
  section_id: string; // KB section this answer is grounded in
  section: string;    // human breadcrumb title, e.g. "Pricing › Local (Bangladesh)"
  snippet: string;    // the exact KB text the answer is grounded in (the "source")
}

export interface AssistantResult {
  answer: string;               // the grounded reply (English or Banglish)
  citations: Citation[];        // 0..n sources; EMPTY when out_of_scope
  confidence: number;           // 0-100, how well the question matched the KB
  out_of_scope: boolean;        // true = question sits outside the KB → refused
  suggested_followups: string[]; // next questions to offer as clickable chips
  cta?: { label: string; href: string }; // optional nudge, e.g. "Get a fixed quote"
  record_id: string;            // simulated log row id
  processed_in_ms: number;
}

export interface AssistantRequest {
  question: string;
  lang?: 'en' | 'banglish' | 'auto';
}

export type AssistantMode = 'live' | 'sample' | 'mock';

export interface AssistantResponse {
  success: boolean;
  mode: AssistantMode; // 'live' = real n8n; 'sample' = curated suggestion; 'mock' = local free-text match
  result?: AssistantResult;
  error?: string;
}

/* ═══════════════════════════════════════════════════════════════
   THE KNOWLEDGE BASE — Shakibul's services, as grounded facts.
   `snippet` is the authoritative source line (shown in the citation);
   `answer` is the assistant's natural, first-person reply derived from
   it. They are authored together so the answer never drifts from its
   source. This is also the "golden" content your n8n retriever should
   be seeded with (see the build kit).
   ═══════════════════════════════════════════════════════════════ */

export type KBCategory = 'Services' | 'Pricing' | 'Process' | 'Tech' | 'Trust' | 'Contact';

export interface KBSection {
  id: string;
  category: KBCategory;
  title: string;      // breadcrumb shown in the citation chip
  snippet: string;    // authoritative KB text (the cited source)
  answer: string;     // grounded reply the assistant speaks
  followups: string[]; // suggested next questions
  tags: string[];     // match keywords — English + Banglish
}

export const KB_SECTIONS: KBSection[] = [
  {
    id: 'svc-overview',
    category: 'Services',
    title: 'Services › What I build',
    snippet:
      'I build practical AI automation on n8n: lead-intake & screening pipelines, document & contract analysis, grounded knowledge assistants (English + Banglish), and live operations dashboards — each wired to the LLM of your choice.',
    answer:
      'I build practical AI automation for growing businesses — four things mainly: (1) lead-intake & screening pipelines that qualify and route enquiries automatically, (2) document & contract analysis that flags risky clauses, (3) grounded assistants like this one that answer customers in English and Banglish without making things up, and (4) live operations dashboards that pull it all into one view. Everything runs on n8n plus the LLM you prefer.',
    followups: ['How much does it cost?', 'How long does a project take?', 'Which industries do you work with?'],
    tags: ['service', 'services', 'build', 'make', 'offer', 'solution', 'solutions', 'automation', 'automate', 'what do you do', 'what can you', 'ki banate', 'ki banao', 'ki ki service', 'ki koro', 'help'],
  },
  {
    id: 'price-local',
    category: 'Pricing',
    title: 'Pricing › Local (Bangladesh)',
    snippet:
      'For businesses in Bangladesh, most projects run between ৳10,000 and ৳50,000 depending on scope, quoted as a fixed price after a short scoping chat.',
    answer:
      'For businesses here in Bangladesh, most projects run between ৳10,000 and ৳50,000 depending on scope. A single focused automation — an intake bot or a document analyzer — sits at the lower end; a multi-step system with a dashboard and integrations sits higher. You get one fixed quote after a short scoping chat, so there are no hourly surprises.',
    followups: ['Do you work with international clients?', 'How do we get started?', 'What can you build for my business?'],
    tags: ['price', 'pricing', 'cost', 'costs', 'charge', 'fee', 'fees', 'budget', 'rate', 'how much', 'koto', 'taka', 'koto taka', 'koto poisa', 'daam', 'kto', 'bdt'],
  },
  {
    id: 'price-intl',
    category: 'Pricing',
    title: 'Pricing › International',
    snippet:
      'For clients outside Bangladesh I work in USD, typically $300–$1,500 per project depending on complexity, or a monthly retainer for ongoing work — fully remote, delivered into your own cloud.',
    answer:
      'Yes — I work with international clients regularly. Pricing is in USD, typically $300–$1,500 per project depending on complexity, or a monthly retainer for ongoing work. I collaborate fully remotely across time zones and deliver everything into your own cloud accounts.',
    followups: ['What is your tech stack?', 'How long does a project take?', 'How do we get started?'],
    tags: ['international', 'usd', 'dollar', 'dollars', 'abroad', 'outside', 'foreign', 'overseas', 'global', 'remote', 'time zone', 'timezone', 'bidesh', 'bidesi', 'other country'],
  },
  {
    id: 'timeline',
    category: 'Process',
    title: 'Process › Timeline',
    snippet:
      'Most first working demos are ready in 24–48 hours; a full production build usually lands within 1–2 weeks depending on integrations and access.',
    answer:
      'Fast. Most first working demos are ready in 24–48 hours, and a full production build usually lands within 1–2 weeks depending on integrations and how quickly we can get access to your tools. You always see a working demo before committing to anything.',
    followups: ['How much does it cost?', 'How do you work, step by step?', 'How do we get started?'],
    tags: ['time', 'timeline', 'how long', 'turnaround', 'delivery', 'deliver', 'fast', 'speed', 'quick', 'when', 'deadline', 'duration', 'koto din', 'koto somoy', 'kobe', 'kotdin'],
  },
  {
    id: 'techstack',
    category: 'Tech',
    title: 'Tech › Stack',
    snippet:
      'The backbone is n8n wired to your choice of LLM (OpenAI, Gemini, or an open model); front-ends in Next.js/React; data in your own Supabase; notifications via Email, Telegram, Slack, or WhatsApp — all in your own cloud.',
    answer:
      'The automation backbone is n8n, wired to the LLM you choose — OpenAI, Gemini, or an open model. Front-ends are built with Next.js and React, data lives in your own Supabase or database, and notifications go through Email, Telegram, Slack, or WhatsApp. It all runs in your own cloud accounts — I never hold your keys.',
    followups: ['Is my data safe?', 'What can you build for my business?', 'How do we get started?'],
    tags: ['tech', 'stack', 'tool', 'tools', 'technology', 'technologies', 'framework', 'n8n', 'llm', 'openai', 'gemini', 'software', 'platform', 'ki diye', 'kon technology', 'how built', 'how do you build'],
  },
  {
    id: 'process',
    category: 'Process',
    title: 'Process › How I work',
    snippet:
      'Four steps: (1) a short scoping chat, (2) a working demo in 24–48 hours, (3) iteration on your real data, (4) hand-off into your own cloud with docs — you approve each step, no long lock-in.',
    answer:
      'Four simple steps: first a short scoping chat to understand the workflow, then a working demo within 24–48 hours, then iteration on your real data, and finally hand-off into your own cloud with documentation. You approve each step before we move on — no surprises and no long lock-in contracts.',
    followups: ['How long does a project take?', 'How much does it cost?', 'Is my data safe?'],
    tags: ['process', 'how do you work', 'how you work', 'method', 'steps', 'step by step', 'approach', 'workflow', 'kivabe kaj', 'kaj koro', 'kibhabe', 'work together', 'engagement'],
  },
  {
    id: 'industries',
    category: 'Services',
    title: 'Services › Industries',
    snippet:
      'I focus on small and growing businesses: clinics/healthcare, real-estate/property, e-commerce & f-commerce, coaching/education, and local service providers.',
    answer:
      'I focus on small and growing businesses — clinics and healthcare practices, real-estate and property teams, e-commerce and f-commerce stores, coaching and education, and local service providers. Each system adapts to that industry’s language and rules.',
    followups: ['What can you build for my business?', 'How much does it cost?', 'How do we get started?'],
    tags: ['industry', 'industries', 'sector', 'niche', 'who do you work with', 'clients', 'clinic', 'doctor', 'health', 'real estate', 'property', 'ecommerce', 'e-commerce', 'fcommerce', 'f-commerce', 'shop', 'store', 'coaching', 'education', 'business type'],
  },
  {
    id: 'security',
    category: 'Trust',
    title: 'Trust › Security & data',
    snippet:
      'Your data stays in your own cloud, is never used to train public models, and assistants are grounded so they only answer from approved knowledge — built by a developer trained in web app security (Byte Capsule).',
    answer:
      'Security is built in, not bolted on. Your data stays in your own cloud accounts, nothing is used to train public models, and assistants like this one are grounded — they only answer from your approved knowledge and never invent facts. I’m also trained in web app security and data protection (Byte Capsule).',
    followups: ['What is your tech stack?', 'How do we get started?', 'What can you build for my business?'],
    tags: ['security', 'secure', 'safe', 'safety', 'data', 'privacy', 'private', 'confidential', 'protect', 'protection', 'gdpr', 'leak', 'train', 'training', 'amar data', 'nirapod', 'shurokkha'],
  },
  {
    id: 'getstarted',
    category: 'Contact',
    title: 'Getting started › Next step',
    snippet:
      'To start, send a one-line description of the task you want automated; you get a scoping question or two and a fixed quote. Most people start with a single demo, see it work, then expand.',
    answer:
      'Getting started is easy: send a one-line description of the task you want automated, and I’ll reply with a scoping question or two plus a fixed quote. Most people start with a single demo, watch it work, then expand from there. Use the contact section just below to reach me.',
    followups: ['How much does it cost?', 'How long does a project take?', 'Do you work with international clients?'],
    tags: ['start', 'get started', 'getting started', 'begin', 'hire', 'hire you', 'contact', 'reach', 'reach you', 'book', 'call', 'talk', 'next step', 'work with you', 'kivabe shuru', 'shuru', 'jogajog', 'kaj dite'],
  },
];

/* ---------- SUGGESTED STARTER QUESTIONS (clickable chips) ---------- */
/* Each is authored to reliably match an intent above, in English + Banglish. */
export const SUGGESTED_QUESTIONS: string[] = [
  'What can you build for my business?',
  'Koto taka lage? (pricing)',
  'Do you work with international clients?',
  'How long does a project take?',
  'Ki ki technology use koro?',
  'Is my data safe?',
  'How do we get started?',
];

/* ═══════════════════════════════════════════════════════════════
   GROUNDED MOCK ENGINE — keyword-matches a question against the KB and
   returns a cited answer, or an honest out-of-scope refusal. The API
   route calls this whenever N8N_ASSISTANT_WEBHOOK_URL is unset (and
   uses it as the baseline the live n8n answer is overlaid onto).
   ═══════════════════════════════════════════════════════════════ */

function stampId(): string {
  return 'ASK-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

const QUOTE_CTA = { label: 'Get a fixed quote', href: '/#contact' };
const TALK_CTA = { label: 'Start a project', href: '/#contact' };

/** Normalize for matching: lowercase, strip punctuation to spaces, collapse ws. */
function normalize(q: string): string {
  return ` ${q.toLowerCase().replace(/[^a-z0-9ঀ-৿]+/gi, ' ').replace(/\s+/g, ' ').trim()} `;
}

/** Score how well a question matches a KB section (count of tag hits). */
function scoreSection(nq: string, section: KBSection): number {
  let hits = 0;
  for (const tag of section.tags) {
    // pad tag so multi-word tags match as phrases and single words match on boundaries
    if (nq.includes(` ${tag} `) || nq.includes(` ${tag}`) || nq.includes(`${tag} `)) hits += 1;
  }
  return hits;
}

/** Best-effort grounded answer for a free-text or suggested question. */
export function computeMockAnswer(question: string): AssistantResult {
  const nq = normalize(question);

  let best: KBSection | null = null;
  let bestScore = 0;
  for (const section of KB_SECTIONS) {
    const s = scoreSection(nq, section);
    if (s > bestScore) {
      bestScore = s;
      best = section;
    }
  }

  if (best && bestScore > 0) {
    const isPricingOrStart = best.category === 'Pricing' || best.id === 'getstarted';
    return {
      answer: best.answer,
      citations: [{ section_id: best.id, section: best.title, snippet: best.snippet }],
      confidence: Math.min(96, 58 + bestScore * 12),
      out_of_scope: false,
      suggested_followups: best.followups,
      cta: isPricingOrStart ? QUOTE_CTA : TALK_CTA,
      record_id: stampId(),
      processed_in_ms: 500 + Math.floor(Math.random() * 700),
    };
  }

  // Nothing matched → honest refusal (the anti-hallucination proof).
  return {
    answer:
      "I can only answer questions about Shakibul's services — what he builds, pricing, timeline, tech, and how to get started. I won’t guess at anything outside that. For anything else, the best next step is a quick chat — want me to connect you?",
    citations: [],
    confidence: 20,
    out_of_scope: true,
    suggested_followups: ['What can you build for my business?', 'How much does it cost?', 'How do we get started?'],
    cta: TALK_CTA,
    record_id: stampId(),
    processed_in_ms: 400 + Math.floor(Math.random() * 500),
  };
}
