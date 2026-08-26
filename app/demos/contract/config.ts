/* ═══════════════════════════════════════════════════════════════
   DEMO 2 — CONTRACT / DOCUMENT X-RAY
   Shared config + data contract (framework-neutral: imported by both
   the client page and the server API route).

   THIS FILE IS THE SPINE. The n8n workflow you build must accept a
   document (sample `{doc, text}` or an uploaded PDF) and return a
   `ContractResult` exactly. The frontend and the mock engine below
   already speak this contract, so the day you set
   N8N_CONTRACT_WEBHOOK_URL the demo goes live with zero code changes.
   ═══════════════════════════════════════════════════════════════ */

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type Severity = 'high' | 'medium' | 'low';

/* ---------- DATA CONTRACT (frontend <-> n8n) ---------- */

export interface Finding {
  id: string;
  severity: Severity;
  category: string;        // 'Auto-renewal' | 'Liability' | 'Termination' | 'Payment' | ...
  title: string;           // short headline, e.g. "Auto-renews in 14 days if no notice"
  quote: string;           // the EXACT clause text (verbatim)
  page: number;            // page the clause is on
  why: string;             // plain-language why-it-matters
  recommendation: string;  // suggested action / redline
}

export interface KeyDate {
  label: string;
  date: string;
  page: number;
  urgency: Severity;
}

export interface KeyTerm {
  label: string;
  value: string;
  page?: number;
}

export interface Party {
  name: string;
  role: string;
}

export interface ContractResult {
  doc_type: string;        // "Non-Disclosure Agreement"
  doc_title: string;       // best-effort document title
  page_count: number;
  parties: Party[];
  overall_risk: { score: number; level: RiskLevel; headline: string }; // score 0-100
  summary: string;         // one-paragraph executive read
  findings: Finding[];     // sorted high->low at render
  key_dates: KeyDate[];
  key_terms: KeyTerm[];
  record_id: string;       // simulated DB row id
  processed_in_ms: number;
}

export type ContractMode = 'live' | 'sample' | 'mock';

export interface ContractResponse {
  success: boolean;
  mode: ContractMode;      // 'live' = real n8n; 'sample'/'mock' = local
  result?: ContractResult;
  error?: string;
}

/* ---------- SAMPLE REGISTRY (shown as the one-click chooser) ---------- */

export interface SampleMeta {
  key: string;
  label: string;
  doc_type: string;
  descriptor: string;      // one-line context under the card
  icon: string;
}

export const SAMPLES: SampleMeta[] = [
  { key: 'nda', label: 'Mutual NDA', doc_type: 'Non-Disclosure Agreement', descriptor: 'Two firms sharing roadmaps before a partnership', icon: '🤝' },
  { key: 'sla', label: 'Vendor SLA', doc_type: 'Master Services & SLA', descriptor: 'SaaS provider service-level agreement', icon: '🛠️' },
  { key: 'lease', label: 'Commercial Lease', doc_type: 'Commercial Lease', descriptor: 'Office space, three-year term', icon: '🏢' },
  { key: 'distributor', label: 'Distributor Agreement', doc_type: 'Distribution & Supply', descriptor: 'Exclusive regional distribution', icon: '📦' },
];

export const SAMPLE_KEYS = SAMPLES.map((s) => s.key);

/* ---------- RISK THRESHOLDS (shared by mock + normalize) ---------- */

export function riskLevel(score: number): RiskLevel {
  return score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';
}

/* ═══════════════════════════════════════════════════════════════
   GOLDEN SAMPLE REPORTS — hand-authored so every sample renders a
   gorgeous, defensible X-ray on camera. These double as the "golden"
   reference your n8n LLM emulates. record_id + processed_in_ms are
   stamped fresh at call time (see computeSampleResult).
   ═══════════════════════════════════════════════════════════════ */

type SampleReport = Omit<ContractResult, 'record_id' | 'processed_in_ms'>;

const REPORTS: Record<string, SampleReport> = {
  /* ---- NDA — Mutual NDA, 6 pages, MEDIUM ~58 ---- */
  nda: {
    doc_type: 'Non-Disclosure Agreement',
    doc_title: 'Mutual Non-Disclosure Agreement',
    page_count: 6,
    parties: [
      { name: 'NimbusAI Ltd.', role: 'Disclosing / Receiving Party' },
      { name: 'Dhaka DataWorks Ltd.', role: 'Disclosing / Receiving Party' },
    ],
    overall_risk: { score: 58, level: 'MEDIUM', headline: 'Confidentiality never sunsets — obligations run forever' },
    summary:
      'A mutual NDA that is broadly balanced on its face but carries a perpetual confidentiality obligation with no expiry, an unusually wide definition of "Confidential Information", and foreign governing law. Signable after two redlines; not a walk-away.',
    findings: [
      {
        id: 'nda-1',
        severity: 'high',
        category: 'Confidentiality',
        title: 'Confidentiality obligations never expire',
        quote: 'The obligations of confidentiality set forth herein shall survive the termination of this Agreement in perpetuity.',
        page: 4,
        why: 'A perpetual duty means you must protect the other side\'s information forever, with no sunset — an open-ended liability that is hard to ever close out.',
        recommendation: 'Cap survival at 3–5 years after termination (trade secrets excepted while they remain secret).',
      },
      {
        id: 'nda-2',
        severity: 'medium',
        category: 'Definitions',
        title: '"Confidential Information" is defined too broadly',
        quote: 'Confidential Information means any and all information disclosed by either Party, whether or not marked or identified as confidential.',
        page: 2,
        why: 'Sweeping in unmarked, oral, and "any and all" information makes almost anything a breach risk and is difficult to administer.',
        recommendation: 'Limit to information marked confidential, or reduce to writing within 15 days if disclosed orally.',
      },
      {
        id: 'nda-3',
        severity: 'medium',
        category: 'Remedies',
        title: 'Injunctive relief without proof of harm',
        quote: 'The Disclosing Party shall be entitled to injunctive relief without the necessity of posting a bond or proving actual damages.',
        page: 5,
        why: 'Lets the other side obtain a court order to stop you quickly and without a bond — a strong lever if a dispute arises.',
        recommendation: 'Make the clause mutual and require a bond, or at least reciprocal remedies for both parties.',
      },
      {
        id: 'nda-4',
        severity: 'low',
        category: 'Governing law',
        title: 'Governed by foreign law (Singapore)',
        quote: 'This Agreement shall be governed by and construed in accordance with the laws of Singapore.',
        page: 6,
        why: 'Disputes would be litigated under foreign law, raising cost and uncertainty for a Bangladesh-based party.',
        recommendation: 'Negotiate Bangladesh law and jurisdiction, or a neutral seat with arbitration.',
      },
    ],
    key_dates: [
      { label: 'Effective date', date: '2026-03-01', page: 1, urgency: 'low' },
      { label: 'Stated term ends (confidentiality survives)', date: '2029-03-01', page: 4, urgency: 'medium' },
    ],
    key_terms: [
      { label: 'Agreement type', value: 'Mutual', page: 1 },
      { label: 'Term', value: '3 years + perpetual confidentiality', page: 4 },
      { label: 'Governing law', value: 'Singapore', page: 6 },
      { label: 'Injunctive relief', value: 'One-sided, no bond', page: 5 },
    ],
  },

  /* ---- SLA — Vendor / Service SLA, 22 pages, HIGH ~81 ---- */
  sla: {
    doc_type: 'Master Services & SLA',
    doc_title: 'Master Services Agreement & Service Level Agreement',
    page_count: 22,
    parties: [
      { name: 'CloudNexus Inc.', role: 'Vendor / Service Provider' },
      { name: 'Client (You)', role: 'Customer' },
    ],
    overall_risk: { score: 81, level: 'HIGH', headline: 'Liability is one-sided and the contract auto-renews for a full year' },
    summary:
      'A vendor-favorable SaaS agreement: it auto-renews for 12 months unless you cancel in a narrow window, promises 99.5% uptime with credits that are hard to actually claim, and caps the vendor\'s liability at one month of fees while leaving yours effectively unlimited. Needs real negotiation before signing.',
    findings: [
      {
        id: 'sla-1',
        severity: 'high',
        category: 'Auto-renewal',
        title: 'Auto-renews for 12 months; 30-day cancellation window',
        quote: 'This Agreement shall automatically renew for successive twelve (12) month terms unless either party provides written notice of non-renewal no less than thirty (30) days prior to the end of the then-current term.',
        page: 3,
        why: 'Miss a 30-day window and you are locked in for another full year — a common and expensive trap.',
        recommendation: 'Add a calendar reminder 60 days out; negotiate month-to-month renewal or a longer notice window.',
      },
      {
        id: 'sla-2',
        severity: 'high',
        category: 'Liability',
        title: 'Vendor liability capped at one month of fees',
        quote: 'In no event shall Provider\'s aggregate liability exceed the fees paid by Customer in the one (1) month immediately preceding the event giving rise to the claim.',
        page: 15,
        why: 'If the vendor causes a serious outage or data loss, your recovery is capped at a single month\'s fee — far below likely damages.',
        recommendation: 'Raise the cap to 12 months of fees; carve out data breach, IP infringement, and confidentiality from the cap.',
      },
      {
        id: 'sla-3',
        severity: 'high',
        category: 'Service levels',
        title: '99.5% uptime, but credits are hard to claim',
        quote: 'Service credits are the sole and exclusive remedy for any failure to meet the uptime commitment and must be requested in writing within five (5) business days of the incident.',
        page: 8,
        why: '99.5% still allows ~3.6 hours of downtime a month, and a 5-day claim window plus "sole remedy" means most outages go uncompensated.',
        recommendation: 'Push for 99.9%, automatic credits, and the right to terminate for chronic breaches.',
      },
      {
        id: 'sla-4',
        severity: 'medium',
        category: 'Data / subprocessors',
        title: 'Vague subprocessor and data-location clause',
        quote: 'Provider may engage subprocessors and store data in any jurisdiction it deems appropriate, and may update its subprocessor list from time to time.',
        page: 11,
        why: 'You lose visibility and control over who touches your data and where it lives — a compliance and privacy risk.',
        recommendation: 'Require a published subprocessor list, prior notice of changes, and a right to object.',
      },
      {
        id: 'sla-5',
        severity: 'medium',
        category: 'Termination',
        title: 'Vendor may terminate for convenience; you cannot',
        quote: 'Provider may terminate this Agreement for convenience upon thirty (30) days written notice. Customer may terminate only for Provider\'s uncured material breach.',
        page: 14,
        why: 'The termination right is asymmetric — the vendor can exit at will while you are locked in absent a breach.',
        recommendation: 'Make termination-for-convenience mutual, or add a pro-rata refund if the vendor exits.',
      },
    ],
    key_dates: [
      { label: 'Effective date', date: '2026-01-15', page: 1, urgency: 'low' },
      { label: 'Non-renewal notice deadline', date: '2026-12-16', page: 3, urgency: 'high' },
      { label: 'Initial term ends', date: '2027-01-15', page: 3, urgency: 'medium' },
    ],
    key_terms: [
      { label: 'Uptime commitment', value: '99.5%', page: 8 },
      { label: 'Vendor liability cap', value: '1 month of fees', page: 15 },
      { label: 'Auto-renewal', value: '12 months', page: 3 },
      { label: 'Payment terms', value: 'Net 15', page: 10 },
    ],
  },

  /* ---- LEASE — Commercial Lease, 14 pages, HIGH ~76 ---- */
  lease: {
    doc_type: 'Commercial Lease',
    doc_title: 'Commercial Office Lease Agreement',
    page_count: 14,
    parties: [
      { name: 'Meghna Properties Ltd.', role: 'Landlord / Lessor' },
      { name: 'Tenant (You)', role: 'Lessee' },
    ],
    overall_risk: { score: 76, level: 'HIGH', headline: 'Auto-renewal trap, steep escalation, and a personal guarantee' },
    summary:
      'A landlord-favorable office lease. It renews automatically unless you give notice in a very short 14-day window, escalates rent 10% every year, shifts most repairs to you, and — most seriously — requires a personal guarantee that puts your own assets on the line. Negotiate the guarantee and the renewal window before signing.',
    findings: [
      {
        id: 'lease-1',
        severity: 'high',
        category: 'Auto-renewal',
        title: 'Auto-renews unless notice is given 14 days before term end',
        quote: 'If the Tenant fails to deliver written notice of intention to vacate at least fourteen (14) days prior to the expiry of the Term, this Lease shall automatically renew for a further period of one (1) year on the same terms.',
        page: 2,
        why: 'A 14-day window is easy to miss, and missing it locks you into another year at the escalated rent.',
        recommendation: 'Extend the notice window to 60–90 days and require the landlord to send a renewal reminder.',
      },
      {
        id: 'lease-2',
        severity: 'high',
        category: 'Rent / escalation',
        title: 'Rent escalates 10% every year',
        quote: 'The monthly rent shall increase by ten percent (10%) on each anniversary of the Commencement Date throughout the Term and any renewal thereof.',
        page: 3,
        why: 'Compounding 10% a year sharply outpaces typical market increases — rent nearly doubles over seven years.',
        recommendation: 'Cap escalation at 5% per year or tie it to an inflation index.',
      },
      {
        id: 'lease-3',
        severity: 'high',
        category: 'Guarantee',
        title: 'Personal guarantee of all lease obligations',
        quote: 'The individual signing on behalf of the Tenant hereby personally and unconditionally guarantees all obligations of the Tenant under this Lease.',
        page: 12,
        why: 'A personal guarantee means the landlord can pursue your personal assets if the business cannot pay — it pierces the company\'s limited liability.',
        recommendation: 'Remove the personal guarantee, or cap it (e.g. to a few months\' rent) and make it burn off after on-time payment.',
      },
      {
        id: 'lease-4',
        severity: 'medium',
        category: 'Maintenance',
        title: 'Most repairs shifted to the tenant',
        quote: 'The Tenant shall, at its own cost, maintain and repair the premises including all structural, electrical, and plumbing systems.',
        page: 7,
        why: 'Structural repairs are normally the landlord\'s responsibility; taking them on can be very expensive.',
        recommendation: 'Carve structural and major systems back to the landlord; keep only interior/cosmetic upkeep.',
      },
      {
        id: 'lease-5',
        severity: 'medium',
        category: 'Termination',
        title: 'Six months\' rent penalty for early termination',
        quote: 'Should the Tenant terminate this Lease prior to expiry of the Term, the Tenant shall pay a sum equal to six (6) months\' rent as liquidated damages.',
        page: 9,
        why: 'A six-month penalty makes it costly to leave early if your needs change.',
        recommendation: 'Reduce to 1–2 months, or allow penalty-free exit with adequate notice after year one.',
      },
    ],
    key_dates: [
      { label: 'Commencement date', date: '2026-04-01', page: 1, urgency: 'low' },
      { label: 'Renewal / vacate notice deadline', date: '2029-03-17', page: 2, urgency: 'high' },
      { label: 'Term ends', date: '2029-03-31', page: 2, urgency: 'medium' },
    ],
    key_terms: [
      { label: 'Monthly rent', value: '৳ 3,50,000', page: 3 },
      { label: 'Annual escalation', value: '10% / year', page: 3 },
      { label: 'Security deposit', value: '6 months', page: 5 },
      { label: 'Guarantee', value: 'Personal, unconditional', page: 12 },
    ],
  },

  /* ---- DISTRIBUTOR — Distribution & Supply, 31 pages, MEDIUM ~64 ---- */
  distributor: {
    doc_type: 'Distribution & Supply',
    doc_title: 'Exclusive Distribution & Supply Agreement',
    page_count: 31,
    parties: [
      { name: 'Zenith Foods Ltd.', role: 'Supplier / Principal' },
      { name: 'Distributor (You)', role: 'Distributor' },
    ],
    overall_risk: { score: 64, level: 'MEDIUM', headline: 'Exclusivity is real but tied to a hefty minimum-purchase penalty' },
    summary:
      'An exclusive distribution deal that gives you a protected territory but conditions it on aggressive minimum purchases, lets the supplier change prices on short notice, and leaves post-termination inventory buyback ambiguous. Workable for a committed distributor after tightening the minimums and the buyback.',
    findings: [
      {
        id: 'dist-1',
        severity: 'high',
        category: 'Minimum purchase',
        title: 'Minimum-purchase shortfall triggers a penalty',
        quote: 'If the Distributor fails to purchase the Minimum Annual Quantity, the Distributor shall pay the Supplier the difference between the amounts actually purchased and the Minimum Annual Quantity.',
        page: 6,
        why: 'You pay for stock you never bought if sales fall short — a large downside if the market softens.',
        recommendation: 'Replace the pay-the-difference penalty with loss of exclusivity as the only consequence, or set realistic ramp-up minimums.',
      },
      {
        id: 'dist-2',
        severity: 'medium',
        category: 'Exclusivity',
        title: 'Exclusivity is conditional on hitting targets',
        quote: 'The exclusivity granted herein shall automatically convert to non-exclusive if the Distributor fails to meet the sales targets in any two consecutive quarters.',
        page: 4,
        why: 'You invest in building the market but can lose exclusivity on a short two-quarter miss.',
        recommendation: 'Lengthen the cure period and let you retain exclusivity if you cure the shortfall.',
      },
      {
        id: 'dist-3',
        severity: 'medium',
        category: 'Pricing',
        title: 'Supplier can change prices on 15 days\' notice',
        quote: 'The Supplier reserves the right to revise the wholesale price list upon fifteen (15) days written notice to the Distributor.',
        page: 9,
        why: 'Short-notice price changes squeeze your margins and make it hard to hold retail pricing.',
        recommendation: 'Fix prices for at least 6–12 months and honor prices on already-placed orders.',
      },
      {
        id: 'dist-4',
        severity: 'medium',
        category: 'Termination',
        title: '90-day termination with unclear inventory buyback',
        quote: 'Either party may terminate upon ninety (90) days notice. Upon termination, the Supplier may, at its option, repurchase remaining inventory at a price to be mutually agreed.',
        page: 22,
        why: '"At its option" and "to be mutually agreed" means you could be left holding unsold stock with no guaranteed buyback price.',
        recommendation: 'Make buyback mandatory at the invoice price (less a small handling fee) for sellable stock.',
      },
      {
        id: 'dist-5',
        severity: 'low',
        category: 'IP / trademark',
        title: 'Tight limits on trademark use',
        quote: 'The Distributor shall use the Supplier\'s trademarks only in the form and manner expressly approved in writing in advance.',
        page: 17,
        why: 'Pre-approval for every use can slow down routine marketing and promotions.',
        recommendation: 'Agree a pre-approved brand kit so day-to-day marketing does not need sign-off each time.',
      },
    ],
    key_dates: [
      { label: 'Effective date', date: '2026-02-01', page: 1, urgency: 'low' },
      { label: 'First minimum-purchase review', date: '2026-08-01', page: 6, urgency: 'high' },
      { label: 'Termination notice period', date: '90 days', page: 22, urgency: 'medium' },
    ],
    key_terms: [
      { label: 'Territory', value: 'Bangladesh (exclusive)', page: 4 },
      { label: 'Minimum annual purchase', value: '৳ 2 crore / year', page: 6 },
      { label: 'Price-change notice', value: '15 days', page: 9 },
      { label: 'Term', value: '3 years', page: 2 },
    ],
  },
};

/* ---------- SAMPLE PLAINTEXT (for the LIVE forwarding trick) ----------
   In LIVE mode the bridge forwards { doc, text } so n8n re-analyzes the
   real clause text (rather than trusting the golden report). Enough text
   per doc for the LLM to reconstruct the same findings. */

export const sampleText: Record<string, string> = {
  nda:
    'MUTUAL NON-DISCLOSURE AGREEMENT between NimbusAI Ltd. and Dhaka DataWorks Ltd., effective 1 March 2026. ' +
    '"Confidential Information" means any and all information disclosed by either Party, whether or not marked or identified as confidential. ' +
    'The obligations of confidentiality set forth herein shall survive the termination of this Agreement in perpetuity. ' +
    'The Disclosing Party shall be entitled to injunctive relief without the necessity of posting a bond or proving actual damages. ' +
    'The stated term of this Agreement is three (3) years. This Agreement shall be governed by and construed in accordance with the laws of Singapore.',
  sla:
    'MASTER SERVICES AGREEMENT & SLA between CloudNexus Inc. (Provider) and the Customer, effective 15 January 2026, payment terms Net 15. ' +
    'This Agreement shall automatically renew for successive twelve (12) month terms unless either party provides written notice of non-renewal no less than thirty (30) days prior to the end of the then-current term. ' +
    'Provider commits to 99.5% monthly uptime. Service credits are the sole and exclusive remedy for any failure to meet the uptime commitment and must be requested in writing within five (5) business days of the incident. ' +
    'In no event shall Provider\'s aggregate liability exceed the fees paid by Customer in the one (1) month immediately preceding the event giving rise to the claim. ' +
    'Provider may engage subprocessors and store data in any jurisdiction it deems appropriate. ' +
    'Provider may terminate this Agreement for convenience upon thirty (30) days written notice. Customer may terminate only for Provider\'s uncured material breach.',
  lease:
    'COMMERCIAL OFFICE LEASE between Meghna Properties Ltd. (Landlord) and the Tenant, commencing 1 April 2026, monthly rent BDT 3,50,000, security deposit six months. ' +
    'If the Tenant fails to deliver written notice of intention to vacate at least fourteen (14) days prior to the expiry of the Term, this Lease shall automatically renew for a further period of one (1) year on the same terms. ' +
    'The monthly rent shall increase by ten percent (10%) on each anniversary of the Commencement Date. ' +
    'The Tenant shall, at its own cost, maintain and repair the premises including all structural, electrical, and plumbing systems. ' +
    'Should the Tenant terminate this Lease prior to expiry of the Term, the Tenant shall pay a sum equal to six (6) months\' rent as liquidated damages. ' +
    'The individual signing on behalf of the Tenant hereby personally and unconditionally guarantees all obligations of the Tenant under this Lease.',
  distributor:
    'EXCLUSIVE DISTRIBUTION & SUPPLY AGREEMENT between Zenith Foods Ltd. (Supplier) and the Distributor, effective 1 February 2026, three-year term, exclusive territory Bangladesh, minimum annual purchase BDT 2 crore. ' +
    'The exclusivity granted herein shall automatically convert to non-exclusive if the Distributor fails to meet the sales targets in any two consecutive quarters. ' +
    'If the Distributor fails to purchase the Minimum Annual Quantity, the Distributor shall pay the Supplier the difference between the amounts actually purchased and the Minimum Annual Quantity. ' +
    'The Supplier reserves the right to revise the wholesale price list upon fifteen (15) days written notice to the Distributor. ' +
    'Either party may terminate upon ninety (90) days notice. Upon termination, the Supplier may, at its option, repurchase remaining inventory at a price to be mutually agreed. ' +
    'The Distributor shall use the Supplier\'s trademarks only in the form and manner expressly approved in writing in advance.',
};

/* ═══════════════════════════════════════════════════════════════
   MOCK / SAMPLE ENGINE — makes the demo feel alive before n8n is wired.
   The API route calls these when N8N_CONTRACT_WEBHOOK_URL is unset.
   ═══════════════════════════════════════════════════════════════ */

function stampId(): string {
  return 'REC-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Returns the golden report for a sample key, stamped with a fresh
 *  record id and a small realistic latency. `null` for an unknown key. */
export function computeSampleResult(doc: string): ContractResult | null {
  const base = REPORTS[doc];
  if (!base) return null;
  return {
    ...base,
    record_id: stampId(),
    processed_in_ms: 900 + Math.floor(Math.random() * 900),
  };
}

/** A valid, friendly result for an upload while in mock mode: neutral
 *  gauge, no findings, the message lives in `summary`. Never an error. */
export function uploadNudgeResult(): ContractResult {
  return {
    doc_type: 'Your uploaded document',
    doc_title: 'Uploaded PDF',
    page_count: 0,
    parties: [],
    overall_risk: { score: 8, level: 'LOW', headline: 'Sample a document for the full X-ray' },
    summary:
      'Live clause extraction from your own PDF runs the moment the engine is connected. In this preview, pick one of the sample contracts above to see the full forensic X-ray — a risk score, flagged clauses with exact page citations, key dates, and key terms.',
    findings: [],
    key_dates: [],
    key_terms: [],
    record_id: stampId(),
    processed_in_ms: 300 + Math.floor(Math.random() * 200),
  };
}
