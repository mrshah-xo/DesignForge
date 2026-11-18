// ============================================================
// DesignForge training corpus (server only).
//
// Distilled from seven real-world, production-caliber DESIGN.md
// specifications supplied as training exemplars:
//
//   Apple · Tesla · Ollama · VoltAgent · Vercel (Geist) · Nike · 1win
//
// The corpus encodes the category structure, formatting conventions,
// token grammar and writing voice those documents share, so every
// DESIGN.md the app generates reads like the exemplars: organized by
// category (Colors, Typography, Layout, Elevation, Shapes, Components,
// Do's & Don'ts, Responsive), with concrete values in every sentence.
//
// Two exports:
//   DESIGN_CORPUS        — full style guide, injected into the DESIGN.md
//                          markdown generation prompt.
//   DESIGN_CORPUS_DIGEST — compact calibration notes, injected into the
//                          design-tokens prompt so token choices follow
//                          the same exemplar patterns.
// ============================================================

// ---------- full corpus for the DESIGN.md markdown prompt ----------

export const DESIGN_CORPUS = `
## STYLE CORPUS — distilled from real DESIGN.md exemplars (Apple, Tesla, Ollama, VoltAgent, Vercel Geist, Nike, 1win)

Every DESIGN.md you write must follow the category structure, token grammar and
writing voice calibrated below. This corpus was trained on seven production
design-system documents; matching their caliber is the bar.

### C1. Canonical category outline (H2 sections, in this order)

1. Overview            — narrative philosophy, then **Key Characteristics:** bullets
2. Colors              — grouped: Brand & Accent / Surface / Text / Semantic & Borders
3. Typography          — Font Family / Hierarchy table / Principles / Note on Font Substitutes
4. Layout & Responsive — Spacing System / Grid & Container / Whitespace Philosophy / Responsive Strategy
5. Elevation & Depth   — level table + Decorative Depth
6. Shapes              — Border Radius Scale table + Photography Geometry
7. Components          — Buttons / Navigation / Inputs & Forms / Pills & Badges / Cards & Containers / Footer
8. Voice, Motion & Imagery — microcopy + motion + icon/photo treatment
9. Logo Usage          — clear space, minimum sizes, approved backgrounds, do/don't
10. Do's and Don'ts    — Do / Don't bullet lists that reference exact tokens
11. Accessibility      — contrast ratios, focus ring, touch targets

### C2. Overview conventions

- Open with a thesis sentence that NAMES the design philosophy in one line
  (exemplar openings: "an exercise in radical subtraction", "photography speaks,
  the chrome doesn't", "the most aggressively under-designed marketing surface
  in the space, and that is the entire point").
- 3-4 narrative paragraphs: what the product is, how the audience's psychology
  shapes the system, what the signature device is, what is deliberately absent.
- Close with **Key Characteristics:** — 6-9 tight bullets, each one a rule with
  a concrete value ("Inter at heavy weights only (600 / 800) — even body is
  semibold", "Single accent green #00d992 carries every CTA; no second accent").

### C3. Colors conventions

- Group tokens under H3 subcategories IN THIS ORDER: **Brand & Accent**, then
  **Surface**, then **Text**, then **Semantic & Borders** (add **Brand Gradient**
  only if the system genuinely uses gradients).
- Each color is ONE bullet in this exact grammar:
  **Evocative Name** (\`{colors.token}\` — #hex): what surfaces it appears on and why it exists.
- Names are evocative and brand-specific, never generic — exemplar names:
  "Action Green", "Electric Blue", "Carbon Dark", "Graphite", "Pewter",
  "Silver Fog", "Light Ash", "Ink Deep", "Soft Surface", "Hairline", "Canvas".
- State the color DISCIPLINE explicitly: how many accents exist, what they are
  each reserved for, and where color is forbidden
  ("green for go/win/register and blue for secondary/navigate/live; everything
  structural is the dark surface ladder" — 1win;
  "the only chromatic color in the entire interface" — Tesla;
  "content supplies the color, chrome stays monochrome" — Nike).
- After the groups: full 12-role token table (Token | Hex | Usage) + palette
  scale strip (Step | Hex, 50→900) + the primary-on-primaryForeground
  contrast ratio with its WCAG verdict.

### C4. Typography conventions

- **Font Family** — narrative paragraph: the exact families + fallback stacks,
  the EXACT weights actually used, and why the pairing fits this brand's voice.
  Call out signature type devices when present: uppercase mono eyebrows with
  wide tracking (Vercel/VoltAgent), heavy-weight-only systems (1win: 600/800),
  rounded display faces echoing pill geometry (Ollama: SF Pro Rounded),
  Display vs Text face split (Tesla, Apple).
- **Hierarchy** — one table: | Token | Size | Weight | Line Height | Letter Spacing | Use |
  with a row per level from display down to caption/code, each Use cell naming
  the real surfaces it sets ("Hero headline", "Game titles", "Badges, chips").
- **Principles** — 3-5 bullets on weight discipline, tracking philosophy and
  size rhythm ("display carries tight negative tracking — the larger the
  heading, the tighter; body sits at neutral spacing" — Vercel).
- **Note on Font Substitutes** — 1-2 sentences naming open-source stand-ins
  (Inter for Geist/custom sans, JetBrains Mono / Geist Mono for SF Mono,
  Nunito for rounded faces) and what to preserve when substituting
  (weight floor, tracking, rounded terminals).
- Include the Google Fonts @import line for both families directly under the
  Typography H2, plus weights and the size scale.

### C5. Layout & Responsive conventions

- **Spacing System** — name the base unit (4px or 8px), then the full token
  ladder ("{spacing.xxs} 2px · {spacing.xs} 4px · {spacing.sm} 8px · … · {spacing.section} 88px"),
  then where each range is spent (button padding, card interiors, section rhythm).
- **Grid & Container** — container max width, column patterns, card-grid arity
  per breakpoint (3-up → 2-up → 1-up).
- **Whitespace Philosophy** — one opinionated paragraph on how air does the
  separating work (Ollama: "88px of plain white air, never decorative dividers";
  Tesla: "one message per viewport-height screen"; 1win: "density is the point").
- **Responsive Strategy** with four H4 parts, in order:
  1. **Breakpoints** — table | Name | Width | Key Changes | (Mobile < 768, Tablet,
     Laptop/Desktop rows with concrete behavior changes)
  2. **Touch Targets** — sizes of the real tap surfaces, 44px minimum callout
  3. **Collapsing Strategy** — what collapses first, what never collapses
     (1win: "the green Registration CTA never enters the menu")
  4. **Image Behavior** — full-bleed vs padded imagery, ratios, lazy-load,
     placeholder treatment

### C6. Elevation & Depth conventions

- One table: | Level | Treatment | Use | — from 0 Flat up through Floating/Modal.
- Then a **Decorative Depth** subsection: what the system uses INSTEAD of heavy
  shadows (hairline borders, surface-brightness steps, frosted glass, inverted
  dark surfaces), and where the single allowed flourish lives
  (Vercel: "the hero mesh gradient is the only atmospheric element";
  Ollama: "the dark Max pricing card is the single 'look here' cue").

### C7. Shapes conventions

- **Border Radius Scale** — table | Token | Value | Use | from 0px to full pill.
- Name the radius LANGUAGE (Vercel: "bimodal — 6px squares for functional
  chrome, 100px pills for marketing CTAs"; Tesla: "4px everywhere, precision
  over playfulness"; Ollama: "pills for everything interactive, 12px for cards").
- **Photography Geometry** — how imagery is cropped/framed: full-bleed inside
  rounded corners, ratios, overlay rules.

### C8. Components conventions

- Group under H3: **Buttons** / **Navigation** / **Inputs & Forms** /
  **Pills & Badges** / **Cards & Containers** / **Footer** (add trust-specific
  components this brand needs — testimonials, security strips, alerts).
- Each component:
  **\`component-name\`** — one-line description of where it appears and what it does,
  then ONE spec line carrying every binding:
  "Background {colors.primary}, text {colors.on-primary}, type {typography.body},
  rounded {rounded.lg}, padding 8×12px." plus height/hover/focus when relevant.
- States are separate sibling entries: \`button-primary-active\`,
  \`button-disabled\`, \`text-input-focused\` — never buried in prose.
- Reference tokens with the brace grammar everywhere:
  {colors.primary} · {typography.body-md} · {rounded.full} · {spacing.lg} ·
  {component.button-primary} — ALWAYS paired with the literal value on first
  use ("({colors.canvas} — #141415)").

### C9. Do's and Don'ts conventions

- ### Do — 6-8 bullets; each one a rule that references exact tokens/hex
  ("Reserve {colors.primary} (green) for primary actions", "Set every label in
  Inter 600+").
- ### Don't — 6-8 bullets; each one PROTECTS the system's discipline — the
  forbidden moves that would dilute it ("Don't add a third structural accent",
  "Don't rely on drop shadows; the surface step is the elevation language",
  "Don't use pure-regular weights — there is no Inter 400 here").

### C10. Voice rules (meta — how every sentence must read)

- Confident, specific, opinionated. Every claim grounded in a value:
  px, hex, weight, ms, ratio. Zero generic filler ("use nice spacing" is a
  corpus violation; "88px between section bands" is corpus-native).
- Name philosophies memorably — one line a designer can repeat in a review:
  "documentation that decided to also sell something" (VoltAgent),
  "the product is everything and the interface is almost nothing" (Tesla),
  "the system is the documentation, and the documentation is the system" (Ollama).
- Prefer the ACTIVE construction and concrete surfaces: not "colors are used
  carefully", but "the blue lives only on links, active tabs and bet highlights".
- Never write placeholders (TBD, [color], "e.g. your brand color"). Every value
  comes from the tokens JSON.

### C11. Exemplar signatures (calibration references)

- **Apple** — SF Pro Display headlines with -0.28px hero tracking; one Action
  Blue #0066cc interactive color; alternating light/dark edge-to-edge canvases;
  no decorative gradients; the single signature shadow lives under product imagery.
- **Tesla** — 100vh cinematic photo sections; UI near-invisible; one blue #3E6AE1
  for CTAs only; weights 400/500 only; 4px radius everywhere; 0.33s cubic-bezier
  for every state change; default letter-spacing at every level.
- **Ollama** — README-as-design-system; every interactive element collapses to a
  9999px pill; pure-black pill CTAs; 88px section rhythm; one inverted dark
  surface per page as the only "look here" cue; code typography is first-class.
- **VoltAgent** — dark canvas #101010 only; single electric green #00d992;
  1px hairline-bordered cards ARE the elevation system; Inter + SF Mono pairing;
  uppercase mono eyebrows at 2.52px tracking; 60px hero at weight 400.
- **Vercel Geist** — ink #171717 on #fafafa; hero mesh gradient as the only
  flourish; button duality (marketing pills vs 6px app squares); Geist Sans
  600 with -2.4px display tracking; Geist Mono uppercase eyebrows; hairline
  cards with whisper shadows.
- **Nike** — 96px uppercase Futura campaign type burned into full-bleed
  photography; black/white/single-gray chrome (~95% of surface); pill black
  CTAs; square 1:1 product imagery on soft cloud; 8px base scale.
- **1win** — near-black canvas with content supplying all saturation; two-signal
  action system (green = go/win/register, blue = secondary/navigate/live);
  Inter 600/800 only; surface ladder + hairlines instead of shadows.

## OUTPUT FORMAT EXAMPLE (structure compression of the exemplar grammar)

## Colors

### Brand & Accent
- **Electric Green** (\`{colors.primary}\` — #00d992): The single brand accent — every primary CTA, status pill and the brand glyph. Reserved.
- **On Primary** (\`{colors.on-primary}\` — #0b0f0c): Text on the green fill.

### Surface
- **Canvas** (\`{colors.background}\` — #101010): The page background — the only surface mode in the system.
- **Hairline** (\`{colors.border}\` — #3d3a39): The 1px border on every card — the brand's universal edge.

### Text
- **Ink** (\`{colors.foreground}\` — #f2f2f2): Default text on the dark canvas.
- **Mute** (\`{colors.mutedForeground}\` — #8b949e): Captions, fine print, footer secondary lines.

## Typography

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| \`{typography.h1}\` | 48px | 600 | 1.1 | -2.4px | Hero headline |
| \`{typography.body}\` | 16px | 400 | 1.5 | 0 | Default body copy |

## Components

### Buttons

**\`button-primary\`** — the electric-green CTA.
- Background \`{colors.primary}\`, text \`{colors.on-primary}\`, type \`{typography.body}\`, rounded \`{rounded.md}\`, padding 12px 20px.

**\`button-primary-disabled\`** — muted, non-interactive twin.
- Background \`{colors.muted}\`, text \`{colors.mutedForeground}\`, cursor not-allowed.

## Do's and Don'ts

### Do
- Reserve \`{colors.primary}\` for primary actions; it is the brand's center of gravity.

### Don't
- Don't add a second accent; the system is one chromatic signal on a neutral ladder.
`.trim();

// ---------- compact digest for the design-tokens (phase 1) prompt ----------

export const DESIGN_CORPUS_DIGEST = `
CALIBRATION — patterns distilled from production DESIGN.md exemplars (Apple, Tesla, Ollama, VoltAgent, Vercel Geist, Nike, 1win):
- Color discipline: 1-2 accents MAX carrying all interactive weight; everything else is a neutral canvas/ink/hairline ladder. Give every token an evocative brand-specific NAME ("Carbon Dark", "Action Green", "Silver Fog"), never generic labels.
- Typography: pick a heading/body pairing that expresses the field (serif gravitas for luxury/finance; geometric sans for tech; rounded for friendly consumer). Declare a small working weight set (2-3 weights) and stick to it. Tight negative letterSpacing on headings (-0.5px to -2.5px) for modern/tech brands; 0 for engineered/restrained brands.
- Radius language must be a deliberate system, not a default: sharp engineered brands stay at 4-6px; friendly consumer brands use 12-16px cards; doc-like brands go full-pill buttons + 12px cards. Match the logo's styleTags.
- Shadows: flat/hairline systems for tech and editorial brands (border-led elevation); soft layered shadows only for warm consumer brands.
- Buttons: name the shape deliberately (pill vs tight square) and keep it consistent across primary/secondary.
`.trim();
