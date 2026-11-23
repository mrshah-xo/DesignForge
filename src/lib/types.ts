// ============================================================
// Shared types for DesignForge — Logo → DESIGN.md platform
// Single source of truth for backend (API routes) and frontend.
// ============================================================

// ---------- Logo analysis ----------
export interface PaletteColor {
  hex: string; // "#0F766E"
  name: string; // "Deep Teal"
  weight: number; // 0-100 dominance score
}

/** Where the logo should live: the recommended page backdrop derived from the logo itself. */
export interface BackgroundSuggestion {
  /** Light backdrops for dark/colored logos, dark backdrops for light/white logos. */
  tone: 'light' | 'dark';
  /** Gradient when the palette carries two distinct hues, solid otherwise. */
  mode: 'solid' | 'gradient';
  /** First (dominant) surface hex. */
  from: string;
  /** Second surface hex for gradients — equals `from` when mode is solid. */
  to: string;
  /** Human-readable why: contrast, mood and industry reasoning. */
  reason: string;
}

export interface AnalysisData {
  palette: PaletteColor[];
  styleTags: string[];
  mood: string;
  temperature: 'warm' | 'cool' | 'neutral' | string;
  industry: string;
  audienceGuess: string;
  trustSignals: string[];
  description: string;
  /** Recommended page backdrop (may be missing on analyses created before this field existed). */
  background?: BackgroundSuggestion;
}

// ---------- Audience ----------
export const CATEGORIES = [
  { value: 'fintech', label: 'Fintech / Payments', hint: 'Banking, wallets, payments, lending, crypto' },
  { value: 'ecommerce', label: 'E-commerce / Digital store', hint: 'Online shops, marketplaces, D2C brands' },
  { value: 'health', label: 'Health & Wellness', hint: 'Telemedicine, fitness, mental health, medical' },
  { value: 'saas', label: 'SaaS / Productivity', hint: 'B2B tools, dashboards, CRM, dev tools' },
  { value: 'education', label: 'Education / E-learning', hint: 'Courses, tutoring, edtech platforms' },
  { value: 'social', label: 'Social / Community', hint: 'Social networks, forums, messaging, dating' },
  { value: 'gaming', label: 'Gaming / Entertainment', hint: 'Games, streaming, media, esports' },
  { value: 'realestate', label: 'Real Estate', hint: 'Property listings, rentals, proptech' },
  { value: 'food', label: 'Food & Delivery', hint: 'Restaurants, delivery, recipes, grocery' },
  { value: 'other', label: 'Other', hint: 'Describe it in your own words' },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]['value'];

export const PLATFORMS = [
  { value: 'web', label: 'Web app / Website' },
  { value: 'mobile', label: 'Mobile app' },
  { value: 'both', label: 'Both web & mobile' },
] as const;

export const MONETIZATION = [
  { value: 'free', label: 'Free / Ad-supported' },
  { value: 'subscription', label: 'Subscription (recurring payment)' },
  { value: 'one_time', label: 'One-time purchase' },
  { value: 'per_use', label: 'Pay per use / commission' },
  { value: 'marketplace', label: 'Marketplace (handles other people\'s money)' },
] as const;

export const TRUST_LEVELS = [
  { value: 'low', label: 'Low — casual use, no sensitive data' },
  { value: 'medium', label: 'Medium — personal data involved' },
  { value: 'high', label: 'High — sensitive personal data' },
  { value: 'critical', label: 'Critical — users pay / money involved' },
] as const;

export interface AudienceData {
  category: CategoryValue;
  categoryLabel: string;
  audienceDesc: string;
  platform: string;
  monetization: string;
  trustNeed: string;
  notes: string;
}

// ---------- Research report (automatic research, user review) ----------
export interface ResearchSection {
  title: string;
  body: string;
  bullets: string[];
}

export interface CompetitorBrand {
  name: string;
  colors: string;
  approach: string;
}

export interface ResearchSections {
  audiencePsychology: ResearchSection;
  trustFactors: ResearchSection;
  successfulPatterns: ResearchSection;
  competitorLogos: { title: string; body: string; brands: CompetitorBrand[] };
  colorTheory: ResearchSection;
  commonMistakes: ResearchSection;
}

export interface ResearchSource {
  name: string;
  url: string;
  note: string;
}

export interface ResearchData {
  status: 'needs_review' | 'approved' | string;
  sections: ResearchSections;
  sources: ResearchSource[];
  reviewedAt: string | null;
}

// ---------- Design spec ----------
export type ColorRole =
  | 'primary'
  | 'primaryForeground'
  | 'secondary'
  | 'accent'
  | 'background'
  | 'foreground'
  | 'muted'
  | 'mutedForeground'
  | 'border'
  | 'success'
  | 'warning'
  | 'danger';

export interface ColorToken {
  hex: string;
  name: string;
  usage: string;
}

export interface PaletteStep {
  step: string; // "50" | "100" ... "900"
  hex: string;
  name: string;
}

/** Available custom cursor packs for the "Cursor styles" feature. '' = system cursors (off). */
export type CursorPackValue = 'windows' | 'macos' | 'dot' | 'crosshair' | '';

/**
 * Visual style effects layered on top of the base tokens by a prebuilt
 * style (Apple HIG, Liquid Glass, Google glow, …). Optional flags —
 * the live preview renders the matching treatment when a flag is set.
 */
export interface DesignStyleFlags {
  /** Liquid-glass surfaces: translucent cards/nav/inputs + backdrop blur over a gradient canvas. */
  glass?: boolean;
  /** Google Gemini-style animated RGB glow edge on SELECTED components (primary buttons + focused input). */
  glow?: boolean;
  /** Stripe-style tinted gradient wash behind the hero section. */
  gradientHero?: boolean;
  /** Apple-style soft ambient finish: airy continuous-corner shadows and gently larger radii. */
  softAmbient?: boolean;
  /** Vision Pictures pill-button pack applied to primary CTAs ('plastic' or 'venom'), empty/undefined = off. */
  buttonPreset?: 'plastic' | 'venom' | '';
  /** Custom cursor pack applied across the whole surface ('windows' | 'macos' | 'dot' | 'crosshair'), empty/undefined = system cursors. */
  cursorPack?: CursorPackValue;
}

export interface DesignTokens {
  brand: {
    name: string;
    personality: string[]; // e.g. ["trustworthy","modern","calm"]
    voice: string;
  };
  colors: Record<ColorRole, ColorToken>;
  paletteScale: PaletteStep[];
  typography: {
    heading: { family: string; weights: number[]; letterSpacing: string };
    body: { family: string; weights: number[]; lineHeight: string };
    scale: Record<'h1' | 'h2' | 'h3' | 'h4' | 'body' | 'small' | 'caption', string>;
  };
  radius: { sm: string; md: string; lg: string; full: string };
  shadows: { sm: string; md: string; lg: string };
  buttons: { primary: string; secondary: string; shape: string };
  trustPatterns: string[];
  previewCopy: PreviewCopy;
  style?: DesignStyleFlags;
}

/** Domain-aware microcopy used by the live component preview. */
export interface PreviewCopy {
  navLinks: string[];
  navCta: string;
  heroHeadline: string;
  heroSubhead: string;
  primaryCta: string;
  secondaryCta: string;
  featureCards: Array<{ icon: PreviewFeatureIcon; title: string; text: string }>;
  pricing: { features: string[] };
  testimonial: { quote: string; author: string; role: string };
  alerts: {
    success: { title: string; text: string };
    warning: { title: string; text: string };
    danger: { title: string; text: string };
  };
}

export type PreviewFeatureIcon = 'sparkles' | 'shield' | 'zap' | 'check';

/** Neutral (domain-agnostic) preview copy used whenever generated copy is missing/invalid. */
export const DEFAULT_PREVIEW_COPY: PreviewCopy = {
  navLinks: ['Products', 'Pricing', 'Customers', 'Blog'],
  navCta: 'Get started',
  heroHeadline: 'Everything you need in one place',
  heroSubhead:
    'A cleaner, faster way to get things done — designed around how you already work.',
  primaryCta: 'Get started',
  secondaryCta: 'Learn more',
  featureCards: [
    {
      icon: 'sparkles',
      title: 'Instant setup',
      text: 'Get up and running in minutes — no complex configuration required.',
    },
    {
      icon: 'shield',
      title: 'Secure by default',
      text: 'Your data stays protected with industry-standard encryption.',
    },
    {
      icon: 'zap',
      title: 'Fast and reliable',
      text: 'A responsive experience that keeps up with whatever you throw at it.',
    },
  ],
  pricing: {
    features: [
      'Everything in the free plan',
      'Unlimited projects',
      'Priority support',
      'Advanced insights',
      'Team collaboration',
    ],
  },
  testimonial: {
    quote:
      'It just works. We got set up in an afternoon and the difference was obvious within the first week.',
    author: 'Maya Chen',
    role: 'Founder, Studio North',
  },
  alerts: {
    success: { title: 'All set', text: 'Your changes were saved successfully.' },
    warning: { title: 'Action needed', text: 'Please review your details to keep everything up to date.' },
    danger: { title: 'Something went wrong', text: 'We hit an unexpected problem. Please try again.' },
  },
};

export interface LogoIssue {
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface LogoSuggestion {
  title: string;
  detail: string;
}

export interface LogoFeedback {
  verdict: string;
  issues: LogoIssue[];
  suggestions: LogoSuggestion[];
}

export interface DesignData {
  tokens: DesignTokens;
  markdown: string;
  matchScore: number; // 0-100
  logoFeedback: LogoFeedback;
}

// AI-suggested design theme variant (research-grounded alternative tokens set)
export interface ThemeVariant {
  id: string;
  name: string;
  reason: string;
  score: number; // 0-100 research fit; highest = AI's best outcome
  tokens: DesignTokens;
}

// ---------- API payloads ----------
export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  status: string;
  logoDataUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectSummary {
  analysis: AnalysisData | null;
  audience: AudienceData | null;
  research: ResearchData | null;
  design: DesignData | null;
  themes: ThemeVariant[];
}

// ---------- Curated Google fonts for the live preview ----------
export const FONT_OPTIONS = [
  'Inter',
  'Manrope',
  'Poppins',
  'Space Grotesk',
  'Sora',
  'Outfit',
  'IBM Plex Sans',
  'Playfair Display',
  'DM Serif Display',
  'Lora',
  'Merriweather',
  'JetBrains Mono',
] as const;

export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Poppins:wght@400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=Sora:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=Playfair+Display:wght@400;500;600;700;800&family=DM+Serif+Display&family=Lora:wght@400;500;600;700&family=Merriweather:wght@400;700;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap';

// ---------- Wizard steps ----------
export const STEPS = [
  { id: 1, key: 'upload', label: 'Upload logo', icon: 'Upload' },
  { id: 2, key: 'analysis', label: 'Logo analysis', icon: 'ScanSearch' },
  { id: 3, key: 'audience', label: 'Who will use it', icon: 'Users' },
  { id: 4, key: 'research', label: 'Research review', icon: 'BookOpenCheck' },
  { id: 5, key: 'match', label: 'Logo fit report', icon: 'GitCompareArrows' },
  { id: 6, key: 'design', label: 'Design system', icon: 'Palette' },
  { id: 7, key: 'export', label: 'Export', icon: 'PackageCheck' },
] as const;

// Standard API envelope: { ok: true, data } | { ok: false, error: string }
export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  /** BYOK gate: the request needs the visitor's own API key. */
  requiresUserKey?: boolean;
}

/** Where users generate their own Z.AI API key (bring-your-own-key). */
export const ZAI_KEY_URL = 'https://z.ai/manage-apikey/apikey-list';

// Async generation job (started via POST, polled via GET?jobId=...)
export type JobKind = 'analyze' | 'research' | 'design' | 'themes';
export type JobStatus = 'running' | 'done' | 'error';

export interface JobInfo {
  id: string;
  kind: JobKind;
  projectId: string;
  status: JobStatus;
  error: string | null;
  /** Live pipeline step (what the AI is actually doing right now), if tracked. */
  progress?: string | null;
}
