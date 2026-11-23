// ============================================================
// Offline research fallback (server only).
// Builds a reviewable research report WITHOUT the LLM when AI
// synthesis fails after every retry (rate limits, outages, quota).
// Real web-search sources + built-in category design knowledge,
// fed through the same normalizeResearchSections pipeline as LLM
// output - so the wizard never dead-ends at step 4.
// ============================================================

import type { AnalysisData, AudienceData, ResearchSource } from '@/lib/types';
import { colorNameFromHex } from '@/lib/server/logo-image';

interface CategoryKnowledge {
  psychology: string[];
  patterns: string[];
  competitors: Array<{ name: string; colors: string; approach: string }>;
  mistakes: string[];
}

/**
 * Built-in design research per category. Kept factual and pattern-level
 * (brand colors described from public knowledge, approaches summarized)
 * so the offline report is genuinely useful without the LLM.
 */
const CATEGORY_KNOWLEDGE: Record<string, CategoryKnowledge> = {
  fintech: {
    psychology: [
      'Money is emotionally charged: users scan for safety signals before they scan for features.',
      'A single missing security cue costs more trust than ten great features add.',
      'Users test credibility with small amounts first - the first-transaction experience decides retention.',
      'Regulatory familiarity (licences, KYC badges) is read as competence, not bureaucracy.',
    ],
    patterns: [
      'Show security and compliance badges directly on signup and payment screens (SSL, PCI DSS, licence numbers).',
      'Set balances and transactions in tabular numerals with consistent decimal alignment.',
      'Break KYC onboarding into progress-stepped screens so it never feels like an endless form.',
      'Disclose fees before the confirm step - transparent pricing outperforms fine print.',
      'Guard destructive actions with confirmation patterns: re-authentication, typed confirmation, delays.',
    ],
    competitors: [
      { name: 'Stripe', colors: 'Indigo-violet #635BFF on white', approach: 'Developer-first minimalism - muted surfaces, one confident accent, meticulous microcopy.' },
      { name: 'PayPal', colors: 'Institutional blues #003087 / #0070BA', approach: 'Buyer-protection messaging and the recognizable wordmark repeated at every checkout.' },
      { name: 'Revolut', colors: 'Near-black surfaces with electric accents', approach: 'Dark, card-first identity - the product is shown, not described.' },
      { name: 'Wise', colors: 'Bright green #9FE870 on forest #163150', approach: 'Radical fee transparency: the currency calculator is the hero section.' },
    ],
    mistakes: [
      'Hiding fees until late in the flow - the top reason fintech users abandon checkout.',
      'Playful, rounded "fun" styling that makes money features feel unserious.',
      'Low-contrast text on dark dashboards - financial data must be legible at a glance.',
      'Generic illustrations instead of real product screenshots, which reads as vaporware.',
      'No visible customer-support path on screens where money moves.',
    ],
  },
  ecommerce: {
    psychology: [
      'Shoppers fear scams and slow refunds more than they fear high prices.',
      'Product realism - photos, reviews, returns policy - converts better than clever branding.',
      'Trust transfers from recognizable payment icons and familiar marketplace patterns.',
    ],
    patterns: [
      'Show real product photography from multiple angles with zoom.',
      'Surface reviews with photos and verified-purchase badges next to the buy button.',
      'Keep the returns and refund policy one click from the product page.',
      'Persist cart state across sessions and devices.',
      'Show stock levels and delivery estimates early to set expectations.',
    ],
    competitors: [
      { name: 'Amazon', colors: 'Warm orange #FF9900 accent on white', approach: 'Frictionless buying - one-click checkout and ruthless consistency.' },
      { name: 'Shopify', colors: 'Commerce green #96BF48', approach: 'Merchant-first neutrality: the system stays quiet so stores shine.' },
      { name: 'Etsy', colors: 'Handmade coral-orange #F1641E', approach: 'Marketplace humanization through seller profiles and craft stories.' },
      { name: 'ASOS', colors: 'Black/white minimalism with fashion photography', approach: 'Content-commerce blend where product imagery is the interface.' },
    ],
    mistakes: [
      'Hidden shipping costs revealed at checkout.',
      'Fake-looking stock photos - the fastest route to a "scam" perception.',
      'Aggressive popups and countdown timers that erode credibility.',
      'Forced account creation with no guest checkout.',
      'Cluttered trust badges that look bought rather than earned.',
    ],
  },
  health: {
    psychology: [
      'Health decisions are anxiety-driven; calm, quiet design literally lowers perceived risk.',
      'Users look for credentials (degrees, certifications, medical reviewers) before trusting advice.',
      'Privacy fear is specific: users worry about employers, insurers, and family seeing their data.',
    ],
    patterns: [
      'Lead with practitioner credentials and "medically reviewed" notes on content.',
      'Use soft, desaturated palettes with generous whitespace to reduce anxiety.',
      'State data-privacy promises in plain language on the first screen.',
      'Offer human escalation (talk to a person) from every automated flow.',
      'Use inclusive, realistic imagery that reflects actual patients.',
    ],
    competitors: [
      { name: 'Headspace', colors: 'Warm orange #F47D31 with soft blues', approach: 'Approachable illustration makes mental health feel safe to open.' },
      { name: 'Calm', colors: 'Deep blue gradients #0E114A', approach: 'Atmospheric imagery does the emotional work before any copy.' },
      { name: 'Mayo Clinic', colors: 'Clinical navy and white', approach: 'Credential-forward content design with zero decoration.' },
      { name: 'Zocdoc', colors: 'Bright practical blue', approach: 'Reviews and insurance filters turn fear into logistics.' },
    ],
    mistakes: [
      'Bright alarm-red error states for routine validation issues - heightens anxiety.',
      'Airbrushed stock models that feel dishonest in health contexts.',
      'Privacy terms buried in legalese instead of plain-language summaries.',
      'Automated-only support with no human contact path.',
      'Overclaiming results ("guaranteed cure") - destroys credibility instantly.',
    ],
  },
  saas: {
    psychology: [
      'B2B buyers fear expensive switching costs and failed team adoption.',
      'They evaluate with logic but decide after seeing the product work on their own problem.',
      'Dark patterns in pricing erode trust faster than high prices do.',
    ],
    patterns: [
      'Show the real product: interactive demos and honest screenshots, no stock mockups.',
      'Publish transparent pricing with a feature matrix - no "contact sales" gating on core tiers.',
      'Put SOC 2 / GDPR / security documentation behind a visible Security link.',
      'Use customer logos and named case studies with concrete metrics.',
      'Design dense-but-scannable dashboards: consistent iconography and 8px grid discipline.',
    ],
    competitors: [
      { name: 'Linear', colors: 'Near-black UI with violet accents', approach: 'Speed as brand - every interaction feels instant and precise.' },
      { name: 'Notion', colors: 'Warm white and black', approach: 'Calm, chrome-less canvas where the workspace is the brand.' },
      { name: 'Stripe', colors: 'Blurple #635BFF', approach: 'Documentation-quality surfaces and meticulous microcopy.' },
      { name: 'Slack', colors: 'Aubergine #4A154B with playful accents', approach: 'Friendly enterprise: humor and a human voice in system copy.' },
    ],
    mistakes: [
      'Fake urgency or dark-pattern pricing (hidden annual defaults).',
      'Screenshot-less landing pages - buyers assume the product is ugly.',
      'Jargon-dense hero copy that never states what the product does.',
      'Inconsistent dashboard spacing and typography that reads as unpolished engineering.',
      'No visible changelog or status page - signals slow, opaque development.',
    ],
  },
  education: {
    psychology: [
      'Learners fear wasting time more than money; outcome clarity drives trust.',
      'Instructor credibility and visible curriculum depth beat production polish.',
      'Progress mechanics must feel honest - fake gamification reads as manipulative.',
    ],
    patterns: [
      'Show detailed syllabi with lesson durations before signup.',
      'Surface instructor credentials with faces and verifiable links.',
      'Use calm, focus-oriented learning UI: one primary action per screen.',
      'Publish real completion statistics and outcomes instead of inflated claims.',
      'Offer free preview lessons on every course page.',
    ],
    competitors: [
      { name: 'Coursera', colors: 'University blue #0056D2', approach: 'Institution partnerships branded front-and-center.' },
      { name: 'Duolingo', colors: 'Friendly green #58CC02 with owl mascot', approach: 'Playful gamification with visible streak mechanics.' },
      { name: 'Khan Academy', colors: 'Leaf green on white', approach: 'Nonprofit warmth: mission-first copy, zero ads.' },
      { name: 'Udemy', colors: 'Purple #A435F0', approach: 'Marketplace density with review-first social proof.' },
    ],
    mistakes: [
      'Fake countdown timers on course prices.',
      'Inflated "bestseller" badges without verifiable data.',
      'Childish gamification aimed at adult professional audiences.',
      'Hiding total course length or refund terms.',
      'Walls of text where structured visuals would carry the lesson.',
    ],
  },
  social: {
    psychology: [
      'Users judge community health within seconds: is this active, kind, and real?',
      'Fear of harassment and doxxing shapes design expectations.',
      'Emptiness is the ultimate trust killer - an empty feed reads as a dead product.',
    ],
    patterns: [
      'Seed content and moderate visibly; show honest "active now" signals.',
      'Make reporting and blocking one tap away and confirm the action worked.',
      'Design identity with privacy defaults in mind (discoverability settings up front).',
      'Use avatars, names, and timestamps to make interactions feel human.',
      'Onboard users straight into relevant content, not empty states.',
    ],
    competitors: [
      { name: 'Discord', colors: 'Blurple #5865F2, dark-first', approach: 'Community-first UI with always-visible moderation tools.' },
      { name: 'Reddit', colors: 'Orange #FF4500', approach: 'Karma systems make reputation tangible.' },
      { name: 'LinkedIn', colors: 'Professional blue #0A66C2', approach: 'Real-name policy and career stakes keep content quality high.' },
      { name: 'BeReal', colors: 'Minimal black and white', approach: 'Anti-polish design is itself the trust mechanism.' },
    ],
    mistakes: [
      'Empty or bot-filled feeds at first login.',
      'Block and report controls buried deep in menus.',
      'Engagement-bait notifications that feel manipulative.',
      'Public-by-default privacy with settings hidden away.',
      'Clout-chasing mechanics (public follower counts) that invite harassment.',
    ],
  },
  gaming: {
    psychology: [
      'Players distrust anything that smells of pay-to-win or fake scarcity.',
      'Community credibility (streamers, reviews) outweighs official marketing.',
      'Performance is trust: lag and stutter read as disrespect for the player.',
    ],
    patterns: [
      'Design dark, high-contrast interfaces that do not fight game visuals.',
      'Disclose odds/drop rates for any randomized purchase (legally required in many regions).',
      'Use esports-grade typography and team-identity systems.',
      'Show live player counts and server status openly.',
      'Build reward systems with transparent progression curves.',
    ],
    competitors: [
      { name: 'Steam', colors: 'Dark blue-gray #1B2838', approach: 'Reviews and a real refund policy as trust infrastructure.' },
      { name: 'Riot Games', colors: 'Competitive red #D13639 on dark', approach: 'Esports-grade visual systems with strict brand discipline.' },
      { name: 'Epic Games', colors: 'Black/white with bold type', approach: 'Store simplicity and free-game generosity as the trust lever.' },
      { name: 'Xbox', colors: 'Signature green #107C10', approach: 'Coherent motion and sound design across hardware and UI.' },
    ],
    mistakes: [
      'Loot-box style spinners without odds disclosure.',
      'Autoplaying audio or video on store and landing pages.',
      'Urgency-red mechanics on limited-time shops.',
      'Console-density UI with tiny touch targets on mobile.',
      'Fake player counts or visible bots in lobbies.',
    ],
  },
  realestate: {
    psychology: [
      'The largest financial decision of a lifetime: users fear hidden defects and scams.',
      'Listing realism - photos, floor plans, disclosures - drives platform trust.',
      'Agent identity matters: faces and licence numbers outperform brand logos.',
    ],
    patterns: [
      'High-quality photography with honest framing; wide-angle deception backfires.',
      'Show price history, tax data, and days-on-market openly.',
      'Map-first search with transparent, simple filters.',
      'Verified-listing badges and visible agent licence numbers.',
      'Mortgage calculators directly on listing pages.',
    ],
    competitors: [
      { name: 'Zillow', colors: 'Trust blue #006AFF', approach: 'Zestimate transparency makes estimates feel objective.' },
      { name: 'Realtor.com', colors: 'Deep trust blue', approach: 'MLS-sourced accuracy as the core message.' },
      { name: 'Redfin', colors: 'Signal red #C82021 on white', approach: 'Transparent agent fees as the differentiator.' },
      { name: 'Airbnb', colors: 'Hospitality coral #FF5A5F', approach: 'Two-sided reviews build trust between guests and hosts.' },
    ],
    mistakes: [
      'Outdated or misleading listing photos.',
      'Hiding agent commissions and service fees until late.',
      'Lead-gen forms that trigger immediate spam calls.',
      'Cluttered map pins and filter overload.',
      'No mobile optimization for on-the-go search.',
    ],
  },
  food: {
    psychology: [
      'Appetite drives the first impression; photography quality equals perceived food quality.',
      'Users fear wrong orders, cold food, and hidden delivery fees.',
      'Hygiene cues (ratings, kitchen badges) matter more than discounts.',
    ],
    patterns: [
      'Large, high-resolution food photography with honest portion framing.',
      'Show delivery fees and ETAs before checkout, not after.',
      'Surface hygiene ratings and kitchen photos where available.',
      'Real-time order tracking with accurate status stages.',
      'One-tap re-order flows for repeat purchases.',
    ],
    competitors: [
      { name: 'DoorDash', colors: 'Delivery red #FF3008', approach: 'Logistics-forward UI with prominent tracking.' },
      { name: 'Uber Eats', colors: 'Speed green #06C167 on black', approach: 'Live map tracking as the core interface.' },
      { name: "Domino's", colors: 'Operational blue and red', approach: 'The Pizza Tracker turned order anxiety into brand equity.' },
      { name: 'Starbucks', colors: 'Ritual green #00704A', approach: 'Rewards designed around habitual trust.' },
    ],
    mistakes: [
      'Menu photos that misrepresent portions - the expectation gap kills repeat orders.',
      'Surge delivery fees revealed at the final step.',
      'Cartoonish food illustrations where real photos belong.',
      'No order-status feedback after payment.',
      'Promo banners fighting the menu for attention.',
    ],
  },
  other: {
    psychology: [
      'New/unfamiliar products are judged on polish: design quality is read as company quality.',
      'Users check whether others already use and endorse the product before committing.',
      'Clear, honest copy outperforms hype for audiences with no prior brand context.',
    ],
    patterns: [
      'Show the real product working - honest screenshots and demos beat abstractions.',
      'Keep pricing transparent and reachable within one click.',
      'Use named testimonials with roles and photos.',
      'Maintain strict visual consistency: one accent color, one type pairing, one grid.',
      'Provide a visible, human support path from day one.',
    ],
    competitors: [
      { name: 'Apple', colors: 'Black/white with product-led color', approach: 'Restraint and confidence: few elements, each perfect.' },
      { name: 'Notion', colors: 'Warm white and black', approach: 'Content-first canvas design that lets the product speak.' },
      { name: 'Airbnb', colors: 'Coral #FF5A5F', approach: 'Human photography and two-sided reviews build belonging.' },
      { name: 'Spotify', colors: 'Vivid green #1DB954 on black', approach: 'One loud accent color carried by disciplined dark surfaces.' },
    ],
    mistakes: [
      'Generic template styling that reads as untrustworthy for a novel product.',
      'Hype copy ("revolutionary", "disruptive") without substance.',
      'Inconsistent spacing and typography that signal carelessness.',
      'No real product visuals on the landing page.',
      'Hidden pricing or contact-gated features.',
    ],
  },
};

/** Trust-lever bullets keyed by how much the audience must trust the product. */
const TRUST_BULLETS: Record<string, string[]> = {
  low: [
    'Skip heavy compliance framing - over-securing a low-stakes product feels bureaucratic.',
    'Trust comes from working software: prioritize speed, delight, and zero-bug basics.',
    'Use honest microcopy instead of badge walls.',
    'Light social proof (user counts, short quotes) is sufficient.',
    'Avoid dark patterns - even casual audiences notice and bounce.',
  ],
  medium: [
    'State the value proposition concretely on the first screen.',
    'Show real product screenshots early - polish signals competence.',
    'Use named testimonials with roles and photos.',
    'Keep pricing transparent and reachable in one click.',
    'Offer a visible, human support path.',
    'Consistent, disciplined visual design reads as reliability.',
  ],
  high: [
    'Display security cues (SSL, data encryption) on signup and payment screens.',
    'Publish clear privacy and data policies in plain language.',
    'Show third-party validation: certifications, press, verified reviews.',
    'Keep copy precise and conservative - overclaiming raises perceived risk.',
    'Provide visible human support with response-time promises.',
    'Design for accountability: real names, real addresses, real screenshots.',
  ],
  critical: [
    'Put payment-security badges (PCI DSS, SSL) directly on money-touching screens.',
    'State buyer protection and refund guarantees explicitly, near the action.',
    'Show regulatory compliance (licences, KYC/AML) where applicable.',
    'Use escrow or documented dispute flows and explain them visually.',
    'Display the audit trail: receipts, confirmation emails, transaction history.',
    'Keep every money moment calm and legible - no playful urgency near payments.',
  ],
};

/** Category-agnostic decision drivers appended to the psychology bullets. */
const EXTRA_PSYCHOLOGY = [
  'First impressions form fast: credibility is judged from the hero screen before any feature is read.',
  'Consistency is trust - every off-brand or unpolished screen taxes credibility.',
];

interface HueGuidance {
  family: string;
  harmony: string;
  caution: string;
}

function hueGuidance(hue: number): HueGuidance {
  if (hue < 15 || hue >= 345) {
    return {
      family: 'red',
      harmony: 'warm neutrals and deep charcoal',
      caution: 'restrict red to errors and destructive actions - it reads as urgency or loss in financial contexts (especially East Asian markets)',
    };
  }
  if (hue < 45) {
    return {
      family: 'orange / warm',
      harmony: 'deep slate or ink neutrals for seriousness',
      caution: 'balance the warmth with disciplined neutrals so energy does not read as casual',
    };
  }
  if (hue < 70) {
    return {
      family: 'yellow / gold',
      harmony: 'dark ink text on cool gray surfaces',
      caution: 'yellow fails contrast on white - use it for accents and highlights, never body text',
    };
  }
  if (hue < 165) {
    return {
      family: 'green',
      harmony: 'analogous teal and blue-green support',
      caution: 'green reads as growth and "go" - keep the success color visually distinct from the brand green',
    };
  }
  if (hue < 200) {
    return {
      family: 'teal / cyan',
      harmony: 'a warm complementary accent (amber or coral)',
      caution: 'teal is calm and competent - avoid drifting into generic medical clichés',
    };
  }
  if (hue < 250) {
    return {
      family: 'blue',
      harmony: 'neutral grays plus one warm accent',
      caution: 'blue is the default trust hue for finance and health - differentiate through typography and spacing, not by going darker',
    };
  }
  if (hue < 290) {
    return {
      family: 'purple / violet',
      harmony: 'warm neutral surfaces to keep it human',
      caution: 'violet signals premium and creative - overuse drifts toward generic startup styling',
    };
  }
  return {
    family: 'magenta / pink',
    harmony: 'disciplined neutral surfaces and dark ink',
    caution: 'pink and magenta read modern and energetic - anchor them with serious typography',
  };
}

function hexHue(hex: string): number {
  const m = /^#?([0-9A-Fa-f]{6})$/.exec(hex.trim());
  if (!m) return 220;
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : Math.round(h);
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Deterministic research report compiled from live web-search results and
 * built-in category knowledge. Mirrors the LLM output shape (sections +
 * sources) so the pipeline post-processing is identical.
 */
export function buildFallbackResearch(
  audience: AudienceData,
  analysis: AnalysisData,
  searchResults: Array<{ name: string; url: string; snippet: string }>,
): { sections: Record<string, unknown>; sources: ResearchSource[] } {
  const knowledge = CATEGORY_KNOWLEDGE[audience.category] ?? CATEGORY_KNOWLEDGE.other;
  const label = (audience.categoryLabel || audience.category || 'product').toLowerCase();
  const trustBullets = TRUST_BULLETS[audience.trustNeed] ?? TRUST_BULLETS.medium;

  const primaryHex = analysis.palette[0]?.hex ?? '#2563EB';
  const primaryName = analysis.palette[0]?.name || colorNameFromHex(primaryHex);
  const guidance = hueGuidance(hexHue(primaryHex));

  const sections: Record<string, unknown> = {
    audiencePsychology: {
      title: 'Audience psychology',
      body:
        `${audience.audienceDesc || `People evaluating a ${label} product`} - they decide within seconds ` +
        `whether a ${label} product feels trustworthy. ${knowledge.psychology[0]} ${knowledge.psychology[1] ?? ''} ` +
        `(Offline research fallback: the AI synthesis service was unavailable, so this report was compiled from ` +
        `live web-search results and built-in ${label} design knowledge - edit freely before approving.)`.trim(),
      bullets: [...knowledge.psychology.slice(2), ...EXTRA_PSYCHOLOGY],
    },
    trustFactors: {
      title: 'Trust factors',
      body:
        `Ranked trust levers for a ${audience.trustNeed}-trust ${label} context` +
        (audience.monetization ? ` with ${audience.monetization} monetization` : '') +
        ', ordered by impact.',
      bullets: trustBullets,
    },
    successfulPatterns: {
      title: 'Successful patterns',
      body: `Concrete UI and design patterns used by trusted products in ${label}.`,
      bullets: knowledge.patterns,
    },
    competitorLogos: {
      title: 'Competitor logos',
      body: `Real brands this audience already trusts in ${label} - study their restraint, consistency, and color discipline (differentiate, do not clone).`,
      brands: knowledge.competitors,
    },
    colorTheory: {
      title: 'Color theory directions',
      body: `The logo's primary ${primaryName} (${primaryHex}) sits in the ${guidance.family} family - viable for ${label} with the right support colors.`,
      bullets: [
        `Keep the 60-30-10 discipline: ~60% neutral surfaces, ~30% secondary, ~10% ${guidance.family} accent.`,
        `Harmony model for ${guidance.family}: pair it with ${guidance.harmony}.`,
        `Caution: ${guidance.caution}.`,
        `Hold body-text contrast at WCAG AA (4.5:1) - verify ${primaryHex} against light and dark surfaces before committing.`,
        'Check cultural connotations for your target markets before finalizing the palette.',
      ],
    },
    commonMistakes: {
      title: 'Common trust mistakes',
      body: `Design mistakes that destroy trust in ${label} - treat these as guardrails for the design system.`,
      bullets: [
        ...knowledge.mistakes,
        'Inconsistent spacing and typography across screens - reads as careless engineering.',
      ].slice(0, 6),
    },
  };

  const sources: ResearchSource[] = searchResults.slice(0, 8).map((r) => ({
    name: r.name?.trim() || hostnameOf(r.url),
    url: r.url,
    note: (r.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 140),
  }));

  return { sections, sources };
}
