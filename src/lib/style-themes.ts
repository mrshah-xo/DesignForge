import type { DesignStyleFlags } from '@/lib/types'

/**
 * Style FEATURES — toggleable effect layers for the design system.
 *
 * Unlike the old "apply a whole prebuilt theme" flow, each feature is a
 * SWITCH that layers one effect on top of the CURRENT theme (colors,
 * typography and radii stay untouched). Features live in
 * `tokens.style` as flags, so they persist with the design, combine
 * freely (glass + RGB glow + pill buttons at the same time) and are
 * rendered by the live preview.
 *
 * References:
 * - Liquid Glass: glassyui-style frosted surfaces (translucent panes +
 *   real backdrop blur over a brand-tinted gradient canvas).
 * - Google RGB glow: the animated conic-gradient border Google uses on
 *   its AI action elements (the Gemini ask button / response containers
 *   while generating) — applied ONLY to selected components, never
 *   globally.
 * - Gradient hero: Stripe-style tinted hero wash.
 * - Soft ambient: Apple HIG-style soft continuous shadows.
 * - Pill buttons: the Vision Pictures "Free Buttons" pack (plastic pill
 *   / venom pill), adapted as CSS and recolored to the brand primary.
 */

/** Preset values used by features that carry a picker (pill buttons, cursor packs). */
export type StylePresetValue = 'plastic' | 'venom' | 'windows' | 'macos' | 'dot' | 'crosshair'

export interface StyleFeature {
  id: 'glass' | 'glow' | 'gradientHero' | 'softAmbient' | 'buttonPreset' | 'cursorPack'
  name: string
  tagline: string
  description: string
  /** Whether toggling this feature needs an extra preset picker. */
  hasPreset?: boolean
  presets?: Array<{ value: StylePresetValue; label: string }>
}

export const STYLE_FEATURES: StyleFeature[] = [
  {
    id: 'glass',
    name: 'Liquid Glass',
    tagline: 'Frosted translucent surfaces with real backdrop blur (glassyui)',
    description:
      'Turns your cards, navbar and inputs into translucent frosted panes floating over a brand-tinted gradient canvas. Hairline borders and glowy depth shadows — no colors are changed.',
  },
  {
    id: 'glow',
    name: 'Google RGB glow',
    tagline: 'Animated multicolor edge on selected components only (Gemini-style)',
    description:
      'The animated RGB gradient border Google uses on Gemini AI action elements — a rotating conic glow around primary CTAs and the focused input. Selected components only, never the whole page.',
  },
  {
    id: 'gradientHero',
    name: 'Gradient hero wash',
    tagline: 'Stripe-style brand-tinted hero gradient',
    description:
      'Paints a soft brand-colored gradient wash behind the hero section that fades into the page — the Stripe landing-page playbook, built from your own colors.',
  },
  {
    id: 'softAmbient',
    name: 'Soft ambient finish',
    tagline: 'Apple HIG-style airy shadows and gentle radii',
    description:
      'Adds the Apple-style soft ambient depth: bigger, airier shadows on cards and gently enlarged corner radii. Your palette and type stay exactly as they are.',
  },
  {
    id: 'buttonPreset',
    name: 'Pill buttons',
    tagline: 'Vision Pictures button pack — plastic or venom, recolored to your brand',
    description:
      'Your uploaded Vision Pictures button pack, adapted as CSS and recolored to the brand: "Plastic" is the inflated foil pill with a top gloss, "Venom" the matte black pill with a brand under-glow and springy press. Applies to primary CTAs.',
    hasPreset: true,
    presets: [
      { value: 'plastic', label: 'Plastic' },
      { value: 'venom', label: 'Venom' },
    ],
  },
  {
    id: 'cursorPack',
    name: 'Cursor styles',
    tagline: 'Replace the system cursor everywhere — Windows, macOS, modern dot or crosshair',
    description:
      'Swaps the browser default arrow, hand and text beam for a full custom pack across your whole surface: "Windows" and "macOS" recreate the OS cursor language (mouse, link and text states), "Modern dot" is the minimal dot-to-ring trend, "Crosshair" targets creative tools. The preview adds a Mouse / Link / Text demo strip so you can feel every state.',
    hasPreset: true,
    presets: [
      { value: 'windows', label: 'Windows' },
      { value: 'macos', label: 'macOS' },
      { value: 'dot', label: 'Modern dot' },
      { value: 'crosshair', label: 'Crosshair' },
    ],
  },
]

export function isFeatureOn(style: DesignStyleFlags | undefined, id: StyleFeature['id']): boolean {
  if (!style) return false
  if (id === 'buttonPreset') return Boolean(style.buttonPreset)
  if (id === 'cursorPack') return Boolean(style.cursorPack)
  return style[id] === true
}

/**
 * Current preset value for features that carry a picker (buttonPreset,
 * cursorPack). Boolean features have no preset and return undefined.
 */
export function activeFeaturePreset(
  style: DesignStyleFlags | undefined,
  id: StyleFeature['id'],
): string | undefined {
  if (!style) return undefined
  if (id === 'buttonPreset') return style.buttonPreset || undefined
  if (id === 'cursorPack') return style.cursorPack || undefined
  return undefined
}

/** Build the next style flags after toggling a feature on/off. */
export function toggleStyleFeature(
  style: DesignStyleFlags | undefined,
  id: StyleFeature['id'],
  on: boolean,
  preset: StylePresetValue = 'plastic',
): DesignStyleFlags {
  const next: DesignStyleFlags = { ...(style ?? {}) }
  if (id === 'buttonPreset') {
    next.buttonPreset = on ? (preset === 'venom' ? 'venom' : 'plastic') : ''
  } else if (id === 'cursorPack') {
    // Guard against a preset belonging to another feature (e.g. 'plastic').
    const valid = preset === 'windows' || preset === 'macos' || preset === 'dot' || preset === 'crosshair'
    next.cursorPack = on ? (valid ? preset : 'windows') : ''
  } else {
    next[id] = on
  }
  return next
}
