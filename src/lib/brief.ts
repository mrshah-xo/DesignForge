// ============================================================
// "Want a prompt?" — agent brief helpers.
//
// The home page can hand the user a prompt template they paste
// into any coding agent (ChatGPT, Claude, Gemini...). The agent
// interviews them and prints a DESIGNFORGE_BRIEF block; the user
// pastes that reply back into DesignForge and every required
// field is filled automatically.
//
// Pure functions only — safe for both client and server use.
// ============================================================

import {
  CATEGORIES,
  MONETIZATION,
  PLATFORMS,
  TRUST_LEVELS,
  type AudienceData,
  type CategoryValue,
} from '@/lib/types';

// ---------- The prompt template the user copies into their agent ----------

export const BRIEF_PROMPT = `You are filling a design brief for DesignForge, a tool that turns a logo plus brand info into a complete design system. I am pasting this into you, my coding agent, because you already know the product you are building for me.

Answer ALL 8 fields yourself in ONE single message. Do NOT interview me. Do NOT ask questions. Do NOT split the answer across messages. If my message includes project details, use them; otherwise infer everything from the project you know and decide a sensible value for every field.

The fields:
1. PROJECT_NAME - the project or product name
2. DESCRIPTION - what the product does, 1-2 sentences, one line
3. CATEGORY - exactly one allowed value: fintech, ecommerce, health, saas, education, social, gaming, realestate, food, other
4. AUDIENCE - who will use it: role, situation, what they worry about, one line
5. PLATFORM - exactly one allowed value: web, mobile, both
6. MONETIZATION - exactly one allowed value: free, subscription, one_time, per_use, marketplace
7. TRUST_NEED - exactly one allowed value: low, medium, high, critical (critical = users pay / money changes hands)
8. NOTES - extra notes for the design research, one line, or "none"

OUTPUT PATTERN - your reply must be EXACTLY this block, nothing before it and nothing after it:

<<<DESIGNFORGE_BRIEF>>>
PROJECT_NAME: <one line>
DESCRIPTION: <one line>
CATEGORY: <one allowed value>
AUDIENCE: <one line>
PLATFORM: <one allowed value>
MONETIZATION: <one allowed value>
TRUST_NEED: <one allowed value>
NOTES: <one line or none>
<<<END_DESIGNFORGE_BRIEF>>>

Example of a correct one-shot reply:

<<<DESIGNFORGE_BRIEF>>>
PROJECT_NAME: LedgerMate
DESCRIPTION: Invoicing and expense tracking built for solo freelancers.
CATEGORY: fintech
AUDIENCE: Solo freelance designers and developers who invoice clients monthly and worry about late payments.
PLATFORM: web
MONETIZATION: subscription
TRUST_NEED: critical
NOTES: Competitors are FreshBooks and Bonsai; the brand should feel calm and trustworthy.
<<<END_DESIGNFORGE_BRIEF>>>`;

// ---------- Parsed brief shape ----------

export const BRIEF_FIELDS = [
  'name',
  'description',
  'category',
  'audienceDesc',
  'platform',
  'monetization',
  'trustNeed',
  'notes',
] as const;

export type BriefField = (typeof BRIEF_FIELDS)[number];

export interface ParsedBrief {
  name: string | null;
  description: string | null;
  category: CategoryValue | null;
  audienceDesc: string | null;
  platform: string | null;
  monetization: string | null;
  trustNeed: string | null;
  notes: string | null;
  /** Canonical keys actually found in the text. */
  found: BriefField[];
}

/** Human labels for toasts ("Filled: project name, audience, ..."). */
export const FIELD_LABELS: Record<BriefField, string> = {
  name: 'project name',
  description: 'description',
  category: 'category',
  audienceDesc: 'audience',
  platform: 'platform',
  monetization: 'monetization',
  trustNeed: 'trust level',
  notes: 'notes',
};

/** Max chars accepted by /api/parse-brief (generous; agent replies are small). */
export const PARSE_BRIEF_MAX_CHARS = 20000;

// ---------- Limits mirroring the form inputs / API validation ----------

const LIMITS: Record<BriefField, number> = {
  name: 80,
  description: 280,
  category: 80,
  audienceDesc: 2000,
  platform: 60,
  monetization: 60,
  trustNeed: 60,
  notes: 280,
};

function clamp(value: string, max: number): string {
  return value.trim().slice(0, max).trim();
}

/** Strip markdown emphasis that agents love to sprinkle around values. */
function cleanValue(value: string): string {
  return value.replace(/[*>`]+/g, '').trim();
}

// ---------- Canonical field aliases ----------
// Keys are the uppercased, letters-only form of any header an agent
// might plausibly use ("Project name", "PROJECT_NAME:", "**Audience**").

const FIELD_ALIASES: Record<string, BriefField> = {
  NAME: 'name',
  PROJECT: 'name',
  PROJECTNAME: 'name',
  PRODUCTNAME: 'name',
  APPNAME: 'name',
  PRODUCT: 'name',
  BRAND: 'name',
  BRANDNAME: 'name',

  DESCRIPTION: 'description',
  WHATISIT: 'description',
  PRODUCTDESCRIPTION: 'description',
  SUMMARY: 'description',
  ABOUT: 'description',

  CATEGORY: 'category',
  INDUSTRY: 'category',
  SECTOR: 'category',

  AUDIENCE: 'audienceDesc',
  AUDIENCEDESC: 'audienceDesc',
  AUDIENCEDESCRIPTION: 'audienceDesc',
  TARGETAUDIENCE: 'audienceDesc',
  TARGETUSER: 'audienceDesc',
  TARGETUSERS: 'audienceDesc',
  USERS: 'audienceDesc',

  PLATFORM: 'platform',

  MONETIZATION: 'monetization',
  BUSINESSMODEL: 'monetization',
  PRICING: 'monetization',
  REVENUE: 'monetization',

  TRUSTNEED: 'trustNeed',
  TRUST: 'trustNeed',
  TRUSTLEVEL: 'trustNeed',

  NOTES: 'notes',
  EXTRANOTES: 'notes',
  OTHER: 'notes',
  MISC: 'notes',
};

function canonicalKey(rawKey: string): BriefField | null {
  const norm = rawKey.toUpperCase().replace(/[^A-Z]/g, '');
  return FIELD_ALIASES[norm] ?? null;
}

// ---------- Enum normalizers (fuzzy, tolerant of prose) ----------

export function normalizeCategory(raw: string): CategoryValue | null {
  const v = cleanValue(raw).toLowerCase();
  if (!v) return null;
  const direct = CATEGORIES.find((c) => c.value === v || c.label.toLowerCase() === v);
  if (direct) return direct.value;
  const keywords: Array<[CategoryValue, string[]]> = [
    ['fintech', ['fintech', 'payment', 'payments', 'bank', 'wallet', 'finance', 'financial', 'lending', 'loan', 'crypto', 'insur', 'billing', 'invoice']],
    ['ecommerce', ['ecommerce', 'e-commerce', 'e commerce', 'shop', 'store', 'marketplace', 'd2c', 'retail', 'seller', 'commerce', 'merch']],
    ['health', ['health', 'wellness', 'medical', 'clinic', 'fitness', 'mental', 'telemedicine', 'doctor', 'therapy', 'patient', 'pharma']],
    ['saas', ['saas', 'productivity', 'b2b', 'dashboard', 'crm', 'dev tool', 'developer', 'software', 'workflow', 'automation', 'analytics', 'tool']],
    ['education', ['education', 'e-learning', 'elearning', 'edtech', 'course', 'tutor', 'learning', 'school', 'student', 'study', 'lms']],
    ['social', ['social', 'community', 'forum', 'messaging', 'chat app', 'dating', 'network', 'creator']],
    ['gaming', ['gaming', 'game', 'esports', 'streaming', 'entertainment', 'media', 'video', 'music', 'movie']],
    ['realestate', ['real estate', 'real-estate', 'realestate', 'proptech', 'property', 'rental', 'rent', 'housing', 'landlord', 'tenant']],
    ['food', ['food', 'delivery', 'restaurant', 'recipe', 'grocery', 'kitchen', 'menu', 'cafe', 'catering']],
  ];
  for (const [value, words] of keywords) {
    if (words.some((w) => v.includes(w))) return value;
  }
  // A category line existed but nothing matched — "Other" is the honest bucket.
  return 'other';
}

export function normalizePlatform(raw: string): string | null {
  const v = cleanValue(raw).toLowerCase();
  if (!v) return null;
  if (PLATFORMS.some((p) => p.value === v)) return v;
  if (['both', 'cross-platform', 'cross platform', 'web and mobile', 'mobile and web', 'ios and android', 'android and ios', 'responsive', 'pwa'].some((w) => v.includes(w))) return 'both';
  if (['mobile', 'ios', 'android', 'phone', 'smartphone', 'app store', 'play store'].some((w) => v.includes(w))) return 'mobile';
  if (['web', 'website', 'browser', 'desktop', 'web app', 'webapp'].some((w) => v.includes(w))) return 'web';
  return null;
}

export function normalizeMonetization(raw: string): string | null {
  const v = cleanValue(raw).toLowerCase();
  if (!v) return null;
  if (MONETIZATION.some((m) => m.value === v)) return v;
  const keywords: Array<[string, string[]]> = [
    ['marketplace', ['marketplace', 'other people', 'escrow', 'two-sided', 'two sided', 'connects buyers', 'sellers pay']],
    ['subscription', ['subscription', 'recurring', 'monthly plan', 'monthly fee', 'annual', 'saas pricing', 'per month', 'per year']],
    ['one_time', ['one-time', 'one time', 'one_time', 'oneoff', 'one-off', 'lifetime', 'single purchase']],
    ['per_use', ['per-use', 'per use', 'pay as you go', 'pay-as-you-go', 'commission', 'transaction fee', 'per transaction', 'usage-based', 'usage based', 'take rate', 'booking fee']],
    ['free', ['free', 'ad-supported', 'ad supported', 'ads', 'donation', 'open source', 'no payment']],
  ];
  for (const [value, words] of keywords) {
    if (words.some((w) => v.includes(w))) return value;
  }
  return null;
}

export function normalizeTrust(raw: string): string | null {
  const v = cleanValue(raw).toLowerCase();
  if (!v) return null;
  if (TRUST_LEVELS.some((t) => t.value === v)) return v;
  // Explicit level words win over context keywords.
  if (/\bcritical\b/.test(v)) return 'critical';
  if (/\bhigh\b/.test(v)) return 'high';
  if (/\bmedium\b/.test(v)) return 'medium';
  if (/\blow\b/.test(v)) return 'low';
  if (['money', 'payment', 'payments', 'pays', 'paying', 'checkout', 'transaction', 'purchase', 'bank', 'wallet', 'fintech', 'invest', 'trading', 'price'].some((w) => v.includes(w))) return 'critical';
  if (['sensitive', 'medical', 'health record', 'identity', 'document', 'confidential'].some((w) => v.includes(w))) return 'high';
  if (['personal data', 'profile', 'account', 'personal info'].some((w) => v.includes(w))) return 'medium';
  return 'low';
}

// ---------- ParsedBrief builders ----------

function emptyBrief(): ParsedBrief {
  return {
    name: null,
    description: null,
    category: null,
    audienceDesc: null,
    platform: null,
    monetization: null,
    trustNeed: null,
    notes: null,
    found: [],
  };
}

/** Collect raw string values (keyed by canonical field) into a ParsedBrief. */
function buildBrief(collected: Partial<Record<BriefField, string>>): ParsedBrief {
  const brief = emptyBrief();
  const found: BriefField[] = [];
  const push = (field: BriefField, value: string | null) => {
    if (!value) return;
    // TS cannot prove the per-field value type through a union-keyed write;
    // every caller above guarantees the field's own shape (string or enum).
    (brief as Record<BriefField, unknown>)[field] = value;
    found.push(field);
  };

  push('name', collected.name ? clamp(cleanValue(collected.name), LIMITS.name) : null);
  push('description', collected.description ? clamp(cleanValue(collected.description), LIMITS.description) : null);
  push('category', collected.category ? normalizeCategory(collected.category) : null);
  push('audienceDesc', collected.audienceDesc ? clamp(cleanValue(collected.audienceDesc), LIMITS.audienceDesc) : null);
  push('platform', collected.platform ? normalizePlatform(collected.platform) : null);
  push('monetization', collected.monetization ? normalizeMonetization(collected.monetization) : null);
  push('trustNeed', collected.trustNeed ? normalizeTrust(collected.trustNeed) : null);
  push('notes', collected.notes ? clamp(cleanValue(collected.notes), LIMITS.notes) : null);

  brief.found = found;
  return brief;
}

// ---------- Local (offline) parser ----------

const BLOCK_RE = /<<<\s*DESIGNFORGE_BRIEF\s*>>>([\s\S]*?)<<<\s*END_DESIGNFORGE_BRIEF\s*>>>/i;

/** `KEY: value` / `KEY = value` lines, tolerating bullets and markdown bold. */
const FIELD_LINE_RE =
  /^\s*(?:[-*>•·‣]+\s*)?(?:\d{1,2}[.)]\s*)?[*_\s]*([A-Za-z][A-Za-z _-]{1,28}?)[*_\s]*[:=][*_\s]*(.+?)\s*$/;

/**
 * Parse an agent reply without any network call. Handles:
 * - the exact DESIGNFORGE_BRIEF block,
 * - bare `Field: value` lines anywhere in the reply,
 * - a JSON object with familiar keys.
 * Returns a ParsedBrief whose `found` lists what was recognized.
 */
export function parseBriefLocally(text: string): ParsedBrief {
  const raw = (text ?? '').trim();
  if (!raw) return emptyBrief();

  const collected: Partial<Record<BriefField, string>> = {};

  // 1) JSON shape? (some agents answer with an object instead of the block)
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const obj: unknown = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
          const field = canonicalKey(key);
          if (field && !collected[field] && (typeof value === 'string' || typeof value === 'number')) {
            const str = String(value).trim();
            if (str) collected[field] = str;
          }
        }
      }
    } catch {
      // Not valid JSON — fall through to line scanning.
    }
  }

  // 2) Line scan (covers the block and loose `Field: value` replies).
  if (Object.keys(collected).length === 0) {
    const blockMatch = BLOCK_RE.exec(raw);
    const body = blockMatch ? blockMatch[1] : raw;
    for (const line of body.split(/\r?\n/)) {
      const match = FIELD_LINE_RE.exec(line);
      if (!match) continue;
      const field = canonicalKey(match[1]);
      if (!field) continue;
      const value = cleanValue(match[2]);
      if (value && !collected[field]) collected[field] = value;
    }
  }

  return buildBrief(collected);
}

// ---------- Server-side normalizer for the LLM extraction route ----------

function looseGet(obj: Record<string, unknown>, field: BriefField): string | null {
  for (const [key, value] of Object.entries(obj)) {
    if (canonicalKey(key) !== field) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

/** Normalize a raw LLM JSON response into a safe ParsedBrief. */
export function normalizeBriefRaw(raw: unknown): ParsedBrief {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyBrief();
  const obj = raw as Record<string, unknown>;
  const collected: Partial<Record<BriefField, string>> = {};
  for (const field of BRIEF_FIELDS) {
    const value = looseGet(obj, field);
    if (value) collected[field] = value;
  }
  return buildBrief(collected);
}

// ---------- Merging + audience prefill ----------

/** Merge two parses: `primary` fields win, `fallback` fills the gaps. */
export function mergeBriefs(primary: ParsedBrief, fallback: ParsedBrief): ParsedBrief {
  const brief = emptyBrief();
  const found: BriefField[] = [];
  for (const field of BRIEF_FIELDS) {
    const value = primary[field] ?? fallback[field];
    if (value) {
      (brief as Record<BriefField, unknown>)[field] = value;
      found.push(field);
    }
  }
  brief.found = found;
  return brief;
}

/** Extract the step-3 audience fields from a parsed brief (null if none). */
export function audiencePrefillFromBrief(brief: ParsedBrief): Partial<AudienceData> | null {
  const audience: Partial<AudienceData> = {};
  if (brief.category) {
    audience.category = brief.category;
    audience.categoryLabel = CATEGORIES.find((c) => c.value === brief.category)?.label ?? brief.category;
  }
  if (brief.audienceDesc) audience.audienceDesc = brief.audienceDesc;
  if (brief.platform) audience.platform = brief.platform;
  if (brief.monetization) audience.monetization = brief.monetization;
  if (brief.trustNeed) audience.trustNeed = brief.trustNeed;
  if (brief.notes) audience.notes = brief.notes;
  return Object.keys(audience).length > 0 ? audience : null;
}
