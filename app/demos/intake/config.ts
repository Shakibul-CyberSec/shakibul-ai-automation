/* ═══════════════════════════════════════════════════════════════
   DEMO 1 — LIVE INTAKE ENGINE
   Shared config + data contract (framework-neutral: imported by both
   the client page and the server API route).

   THIS FILE IS THE SPINE. The n8n workflow you build must accept
   `IntakeRequest` and return `IntakeResult` exactly. The frontend and
   the mock engine below already speak this contract, so the day you
   set N8N_INTAKE_WEBHOOK_URL the demo goes live with zero code changes.
   ═══════════════════════════════════════════════════════════════ */

export type Tier = 'HOT' | 'WARM' | 'COLD';
export type Urgency = 'high' | 'medium' | 'low';
export type Accent = 'cyan' | 'emerald' | 'violet' | 'rose';

/* ---------- DATA CONTRACT (frontend <-> n8n) ---------- */

export interface IntakeRequest {
  industry: string;                        // e.g. "clinic"
  submission: Record<string, string>;      // the form fields
  meta: {
    source: string;                        // "demo"
    submitted_at: string;                  // ISO timestamp
  };
}

export interface IntakeResult {
  score: number;                           // 0-100 qualification score
  tier: Tier;                              // HOT | WARM | COLD
  urgency: Urgency;
  tags: string[];                          // e.g. ["urgent", "high-value"]
  summary: string;                         // one-line AI summary
  reasoning: string;                       // short "why this score"
  routed_to: string;                       // team / queue / person
  recommended_action: string;              // next best action
  notification_channel: string;            // "WhatsApp" | "Telegram" | "Email"
  notification_message: string;            // the alert body
  record_id: string;                       // simulated DB row id
  processed_in_ms: number;
}

export interface IntakeResponse {
  success: boolean;
  mode: 'live' | 'mock';                   // where the result came from
  result: IntakeResult;
}

/* ---------- FORM FIELD MODEL ---------- */

export interface IntakeField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
  full?: boolean;                          // span both columns
}

export interface IndustryConfig {
  id: string;
  label: string;
  icon: string;
  accent: Accent;
  tagline: string;
  formTitle: string;
  fields: IntakeField[];
  scoreDimensions: string[];               // shown in UI as "what the AI evaluates"
  routing: { hot: string; warm: string; cold: string };
  channel: string;
  // scoring metadata (used by the mock engine)
  urgentKeywords: string[];
  valueKeywords: string[];
  highValueOptions: string[];              // selecting these boosts score
  tagRules: { keyword: string; tag: string }[];
  sampleData: Record<string, string>;
}

/* ═══════════════════════════════════════════════════════════════
   INDUSTRY CONFIGS — swap-ready. Add a new vertical = add an object.
   ═══════════════════════════════════════════════════════════════ */

export const INDUSTRIES: Record<string, IndustryConfig> = {
  fcommerce: {
    id: 'fcommerce',
    label: 'F-Commerce',
    icon: '🛍️',
    accent: 'emerald',
    tagline: 'Facebook / Messenger order intake',
    formTitle: 'New Order Inquiry',
    fields: [
      { name: 'name', label: 'Customer Name', type: 'text', placeholder: 'Rahim Ahmed' },
      { name: 'phone', label: 'Phone / WhatsApp', type: 'tel', placeholder: '+8801XXXXXXXXX' },
      { name: 'product', label: 'Product Interest', type: 'select', options: ['Women\'s Kurti', 'Kids Set', 'Saree', 'Panjabi', 'Bulk / Wholesale'] },
      { name: 'quantity', label: 'Quantity', type: 'select', options: ['1 piece', '2-5 pieces', '6-20 pieces', '20+ (wholesale)'] },
      { name: 'message', label: 'Message / Requirement', type: 'textarea', placeholder: 'Ei kurti ta ki stock e ache? Kalke ki delivery hobe Dhaka te?', full: true },
    ],
    scoreDimensions: ['Purchase intent', 'Order value', 'Delivery urgency'],
    routing: { hot: 'Order Desk (Priority)', warm: 'Order Desk', cold: 'Nurture / Follow-up' },
    channel: 'WhatsApp',
    urgentKeywords: ['urgent', 'today', 'kalke', 'ajke', 'tomorrow', 'asap', 'quickly', 'taratari', 'now'],
    valueKeywords: ['wholesale', 'bulk', 'box', 'reseller', 'quantity', 'pieces', '20'],
    highValueOptions: ['Bulk / Wholesale', '20+ (wholesale)', '6-20 pieces'],
    tagRules: [
      { keyword: 'wholesale', tag: 'wholesale' },
      { keyword: 'bulk', tag: 'wholesale' },
      { keyword: 'delivery', tag: 'delivery-intent' },
      { keyword: 'stock', tag: 'stock-check' },
      { keyword: 'discount', tag: 'price-sensitive' },
    ],
    sampleData: {
      name: 'Sadia Islam',
      phone: '+8801712345678',
      product: 'Bulk / Wholesale',
      quantity: '20+ (wholesale)',
      message: 'Amar ekta boutique ache. Ei kurti gulo 30 piece lagbe reseller price e. Kalke r moddhe Dhaka te delivery possible?',
    },
  },

  clinic: {
    id: 'clinic',
    label: 'Clinic / Healthcare',
    icon: '🏥',
    accent: 'cyan',
    tagline: 'Patient intake & appointment booking',
    formTitle: 'Patient Appointment Request',
    fields: [
      { name: 'name', label: 'Patient Name', type: 'text', placeholder: 'Full name' },
      { name: 'phone', label: 'Contact Number', type: 'tel', placeholder: '+8801XXXXXXXXX' },
      { name: 'service', label: 'Service Needed', type: 'select', options: ['General Consultation', 'Cardiology', 'Dermatology', 'Dental', 'Diagnostic / Lab Test'] },
      { name: 'preferred', label: 'Preferred Time', type: 'select', options: ['As soon as possible', 'Today', 'This week', 'Next week'] },
      { name: 'message', label: 'Symptoms / Reason', type: 'textarea', placeholder: 'Describe the symptoms or reason for the visit...', full: true },
    ],
    scoreDimensions: ['Clinical urgency', 'Eligibility', 'Appointment fit'],
    routing: { hot: 'Triage Nurse (Priority)', warm: 'Front Desk — Booking', cold: 'Front Desk — Booking' },
    channel: 'WhatsApp',
    urgentKeywords: ['chest pain', 'emergency', 'severe', 'urgent', 'bleeding', 'breathing', 'asap', 'immediately', 'pain', 'fever'],
    valueKeywords: ['cardiology', 'surgery', 'specialist', 'diagnostic', 'package', 'checkup'],
    highValueOptions: ['Cardiology', 'Diagnostic / Lab Test', 'As soon as possible', 'Today'],
    tagRules: [
      { keyword: 'pain', tag: 'symptomatic' },
      { keyword: 'chest', tag: 'priority-triage' },
      { keyword: 'emergency', tag: 'priority-triage' },
      { keyword: 'follow', tag: 'follow-up' },
      { keyword: 'report', tag: 'has-reports' },
    ],
    sampleData: {
      name: 'Mr. Karim Uddin',
      phone: '+8801812345678',
      service: 'Cardiology',
      preferred: 'As soon as possible',
      message: 'My father (62) is having chest pain and shortness of breath since morning. Need to see a cardiologist urgently today.',
    },
  },

  realestate: {
    id: 'realestate',
    label: 'Real Estate',
    icon: '🏢',
    accent: 'violet',
    tagline: 'Property lead qualification',
    formTitle: 'Property Inquiry',
    fields: [
      { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Full name' },
      { name: 'phone', label: 'Phone', type: 'tel', placeholder: '+8801XXXXXXXXX' },
      { name: 'budget', label: 'Budget Range', type: 'select', options: ['Under 50 Lakh', '50L - 1 Crore', '1 - 2 Crore', '2 Crore+'] },
      { name: 'type', label: 'Property Type', type: 'select', options: ['Apartment (Rent)', 'Apartment (Buy)', 'Commercial Space', 'Land / Plot'] },
      { name: 'message', label: 'Requirement', type: 'textarea', placeholder: 'Location, size, timeline...', full: true },
    ],
    scoreDimensions: ['Budget fit', 'Buying intent', 'Timeline'],
    routing: { hot: 'Senior Sales Agent', warm: 'Sales Team', cold: 'Long-term Nurture' },
    channel: 'Telegram',
    urgentKeywords: ['urgent', 'immediately', 'this month', 'ready', 'cash', 'asap', 'visit', 'today'],
    valueKeywords: ['crore', 'buy', 'commercial', 'cash', 'ready', 'booking'],
    highValueOptions: ['1 - 2 Crore', '2 Crore+', 'Apartment (Buy)', 'Commercial Space'],
    tagRules: [
      { keyword: 'cash', tag: 'cash-buyer' },
      { keyword: 'visit', tag: 'site-visit' },
      { keyword: 'loan', tag: 'needs-financing' },
      { keyword: 'commercial', tag: 'commercial' },
      { keyword: 'invest', tag: 'investor' },
    ],
    sampleData: {
      name: 'Tanvir Hasan',
      phone: '+8801912345678',
      budget: '2 Crore+',
      type: 'Apartment (Buy)',
      message: 'Looking to buy a 2000+ sqft ready apartment in Gulshan or Banani. Cash payment, want to visit this week. Serious buyer.',
    },
  },

  legal: {
    id: 'legal',
    label: 'Legal / Law Firm',
    icon: '⚖️',
    accent: 'rose',
    tagline: 'Legal consultation intake',
    formTitle: 'Legal Consultation Request',
    fields: [
      { name: 'name', label: 'Client Name', type: 'text', placeholder: 'Full name' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'name@company.com' },
      { name: 'matter', label: 'Matter Type', type: 'select', options: ['Corporate / M&A', 'Litigation', 'Property / Real Estate', 'Contract Review', 'Family Law'] },
      { name: 'urgency', label: 'Urgency', type: 'select', options: ['Immediate — court date', 'Within a week', 'Planning ahead'] },
      { name: 'message', label: 'Case Description', type: 'textarea', placeholder: 'Brief description of the legal matter...', full: true },
    ],
    scoreDimensions: ['Case value', 'Practice-area fit', 'Urgency'],
    routing: { hot: 'Senior Partner', warm: 'Associate — Intake', cold: 'Intake Queue' },
    channel: 'Email',
    urgentKeywords: ['court', 'deadline', 'urgent', 'notice', 'immediately', 'summon', 'hearing', 'tomorrow'],
    valueKeywords: ['corporate', 'm&a', 'acquisition', 'company', 'contract', 'commercial', 'crore'],
    highValueOptions: ['Corporate / M&A', 'Litigation', 'Immediate — court date'],
    tagRules: [
      { keyword: 'court', tag: 'litigation-active' },
      { keyword: 'contract', tag: 'document-review' },
      { keyword: 'company', tag: 'corporate' },
      { keyword: 'deadline', tag: 'time-sensitive' },
      { keyword: 'property', tag: 'property' },
    ],
    sampleData: {
      name: 'Nabila Rahman',
      email: 'nabila@techstartup.com.bd',
      matter: 'Corporate / M&A',
      urgency: 'Within a week',
      message: 'Our startup is being acquired. We need help reviewing the share purchase agreement and shareholder terms before signing next week.',
    },
  },

  logistics: {
    id: 'logistics',
    label: 'Logistics / Freight',
    icon: '🚢',
    accent: 'emerald',
    tagline: 'Freight quote intake',
    formTitle: 'Freight Quote Request',
    fields: [
      { name: 'company', label: 'Company', type: 'text', placeholder: 'Company name' },
      { name: 'email', label: 'Contact Email', type: 'email', placeholder: 'name@company.com' },
      { name: 'cargo', label: 'Cargo Type', type: 'select', options: ['General Cargo', 'Perishable / Reefer', 'Heavy / Project Cargo', 'Hazardous', 'Documents / Parcel'] },
      { name: 'mode', label: 'Shipping Mode', type: 'select', options: ['Air Freight', 'Sea Freight (FCL)', 'Sea Freight (LCL)', 'Not sure'] },
      { name: 'message', label: 'Route & Details', type: 'textarea', placeholder: 'Origin → destination, weight, volume, timeline...', full: true },
    ],
    scoreDimensions: ['Shipment value', 'Route complexity', 'Urgency'],
    routing: { hot: 'Project Cargo Desk', warm: 'Freight Quote Desk', cold: 'Quote Queue' },
    channel: 'Telegram',
    urgentKeywords: ['urgent', 'asap', 'deadline', 'perishable', 'immediately', 'this week', 'reefer'],
    valueKeywords: ['fcl', 'project', 'heavy', 'container', 'regular', 'monthly', 'tons', 'contract'],
    highValueOptions: ['Heavy / Project Cargo', 'Sea Freight (FCL)', 'Perishable / Reefer'],
    tagRules: [
      { keyword: 'perishable', tag: 'time-critical' },
      { keyword: 'project', tag: 'project-cargo' },
      { keyword: 'regular', tag: 'recurring-volume' },
      { keyword: 'monthly', tag: 'recurring-volume' },
      { keyword: 'customs', tag: 'needs-brokerage' },
    ],
    sampleData: {
      company: 'Meghna Textiles Ltd.',
      email: 'imports@meghnatex.com',
      cargo: 'Heavy / Project Cargo',
      mode: 'Sea Freight (FCL)',
      message: 'We need to ship 3x 40ft containers of machinery from Shanghai to Chittagong monthly. Looking for a long-term freight partner with customs clearance.',
    },
  },
};

export const INDUSTRY_LIST = Object.values(INDUSTRIES);

/* ═══════════════════════════════════════════════════════════════
   MOCK ENGINE — makes the demo feel alive before n8n is wired.
   The API route calls this when N8N_INTAKE_WEBHOOK_URL is unset.
   Deterministic-ish so identical input feels consistent, with a
   light jitter so it feels real. Mirrors what your AI node will do.
   ═══════════════════════════════════════════════════════════════ */

function hashJitter(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return (Math.abs(h) % 9) - 4; // -4..+4
}

export function computeMockResult(req: IntakeRequest): IntakeResult {
  const cfg = INDUSTRIES[req.industry] ?? INDUSTRIES.fcommerce;
  const values = Object.values(req.submission).filter(Boolean);
  const text = values.join(' ').toLowerCase();

  let score = 52;

  // Urgency signal
  const urgentHits = cfg.urgentKeywords.filter((k) => text.includes(k)).length;
  score += urgentHits * 9;

  // Value signal
  const valueHits = cfg.valueKeywords.filter((k) => text.includes(k)).length;
  score += valueHits * 7;

  // High-value option selected
  const optionHit = Object.values(req.submission).some((v) =>
    cfg.highValueOptions.includes(v)
  );
  if (optionHit) score += 12;

  // Detail / effort signal
  const msg = (req.submission.message || '').length;
  score += Math.min(Math.floor(msg / 12), 14);

  // Jitter + clamp
  score += hashJitter(text);
  score = Math.max(38, Math.min(97, score));

  const tier: Tier = score >= 80 ? 'HOT' : score >= 62 ? 'WARM' : 'COLD';
  const urgency: Urgency = urgentHits >= 1 || tier === 'HOT' ? 'high' : tier === 'WARM' ? 'medium' : 'low';

  // Tags
  const tags = new Set<string>();
  if (urgentHits >= 1) tags.add('urgent');
  if (valueHits >= 1 || optionHit) tags.add('high-value');
  for (const rule of cfg.tagRules) if (text.includes(rule.keyword)) tags.add(rule.tag);
  if (tags.size === 0) tags.add('standard');

  const routed_to = tier === 'HOT' ? cfg.routing.hot : tier === 'WARM' ? cfg.routing.warm : cfg.routing.cold;

  const name = req.submission.name || req.submission.company || 'The lead';
  const primaryInterest =
    req.submission.product || req.submission.service || req.submission.type ||
    req.submission.matter || req.submission.cargo || 'the inquiry';

  const summary = `${name} — ${tier === 'HOT' ? 'high-intent' : tier === 'WARM' ? 'qualified' : 'early-stage'} ${cfg.label.toLowerCase()} lead re: ${primaryInterest}.`;

  const reasoning =
    `${urgentHits ? `Urgency signals detected (${urgentHits}). ` : ''}` +
    `${valueHits || optionHit ? 'Strong value indicators. ' : 'Standard value profile. '}` +
    `${msg > 80 ? 'Detailed request.' : 'Brief request.'}`.trim();

  const recommended_action =
    tier === 'HOT'
      ? 'Contact within 15 minutes — do not queue.'
      : tier === 'WARM'
      ? 'Respond today with tailored options.'
      : 'Add to nurture sequence; follow up in 48h.';

  const notification_message =
    `🔔 New ${tier} lead — ${cfg.label}\n` +
    `${name} (${req.submission.phone || req.submission.email || 'no contact'})\n` +
    `Interest: ${primaryInterest}\n` +
    `Score: ${score}/100 · Route: ${routed_to}\n` +
    `Action: ${recommended_action}`;

  return {
    score,
    tier,
    urgency,
    tags: Array.from(tags).slice(0, 4),
    summary,
    reasoning,
    routed_to,
    recommended_action,
    notification_channel: cfg.channel,
    notification_message,
    record_id: 'REC-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    processed_in_ms: 1400 + Math.floor(Math.random() * 900),
  };
}
