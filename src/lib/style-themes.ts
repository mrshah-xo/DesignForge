import type { ColorRole, ColorToken, DesignStyleFlags, DesignTokens } from '@/lib/types'
import { FALLBACK_HEX, isHex } from '@/components/preview/live-preview'

/**
 * Prebuilt, one-click style themes — popular, recognizable design
 * languages (Apple HIG, Liquid Glass, Google glow, …) applied as
 * deterministic transformations of the brand's own tokens. No AI call:
 * they preview instantly and can be applied like any other theme.
 *
 * Pure token edits (colors, typography, radius, shadows) ride in the
 * DesignTokens object; visual EFFECTS (glass blur, glowing edges,
 * gradient hero) ride in `tokens.style` flags that the live preview
 * renders. Everything survives save/load via normalizeTokens.
 */

export interface PrebuiltStyle {
  id: string
  name: string
  tagline: string
  description: string
  /** Style flags applied to the tokens (rendered by the live preview). */
  flags: DesignStyleFlags
  apply: (base: DesignTokens) => DesignTokens
}

// ---------- Client-safe color math ----------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const full = /^#[0-9A-Fa-f]{6}$/.test(hex)
    ? hex
    : /^#([0-9A-Fa-f]{3})$/.test(hex)
      ? `#${hex.slice(1).split('').map((c) => c + c).join('')}`
      : null
  if (!full) return null
  const n = parseInt(full.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (!ca || !cb) return a
  const k = Math.max(0, Math.min(1, t))
  return rgbToHex(ca.r + (cb.r - ca.r) * k, ca.g + (cb.g - ca.g) * k, ca.b + (cb.b - ca.b) * k)
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = hexToRgb(hex)
  if (!rgb) return { h: 0, s: 0, l: 0.5 }
  const { r, g, b } = rgb
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return { h: h * 360, s, l }
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = (((h % 360) + 360) % 360) / 360
  const sn = Math.max(0, Math.min(1, s))
  const ln = Math.max(0, Math.min(1, l > 1 ? l / 100 : l))
  if (sn === 0) {
    const v = Math.round(ln * 255)
    return rgbToHex(v, v, v)
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn
  const p = 2 * ln - q
  const channel = (t: number): number => {
    let tn = t
    if (tn < 0) tn += 1
    if (tn > 1) tn -= 1
    if (tn < 1 / 6) return p + (q - p) * 6 * tn
    if (tn < 1 / 2) return q
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6
    return p
  }
  return rgbToHex(channel(hn + 1 / 3) * 255, channel(hn) * 255, channel(hn - 1 / 3) * 255)
}

const roleHex = (tokens: DesignTokens, role: ColorRole): string => {
  const hex = tokens.colors?.[role]?.hex
  return isHex(hex) ? hex : FALLBACK_HEX[role]
}

const token = (hex: string, name: string, usage: string): ColorToken => ({ hex, name, usage })

const clone = (base: DesignTokens): DesignTokens =>
  JSON.parse(JSON.stringify(base)) as DesignTokens

const cleanFlags = (t: DesignTokens): DesignTokens => {
  const next = clone(t)
  delete next.style
  return next
}

const fontInList = (family: string | undefined, allowed: readonly string[]): string | null => {
  if (!family) return null
  const hit = allowed.find((f) => f.toLowerCase() === family.toLowerCase())
  return hit ?? null
}

// ---------- Shared transform helpers ----------

type SurfaceTone = 'light' | 'dark'

/** Rebuild the neutral surface roles tinted by the primary hue. */
function surfaces(base: DesignTokens, tone: SurfaceTone, tintAmount: number): Record<ColorRole, ColorToken> {
  const primary = roleHex(base, 'primary')
  const { h } = hexToHsl(primary)
  const sat = Math.min(hexToHsl(primary).s, 0.35)
  if (tone === 'dark') {
    return {
      ...base.colors,
      primary: token(primary, base.colors?.primary?.name ?? 'Primary', base.colors?.primary?.usage ?? 'Primary actions and highlights'),
      background: token(hslToHex(h, sat * 0.5, 8), 'Night canvas', 'Page and section backgrounds'),
      foreground: token(hslToHex(h, 0.12, 96), 'Snow text', 'Primary text on dark surfaces'),
      muted: token(hslToHex(h, sat * 0.4, 14), 'Deep surface', 'Cards, wells and secondary fills'),
      mutedForeground: token(hslToHex(h, 0.08, 66), 'Muted text on dark', 'Secondary text and captions'),
      border: token(hslToHex(h, sat * 0.4, 22), 'Dark hairline', 'Dividers, outlines and input borders'),
      secondary: token(hslToHex(h, sat * 0.45, 17), 'Elevated surface', 'Secondary fills on dark'),
      accent: token(hslToHex(h, Math.min(hexToHsl(primary).s + 0.1, 0.7), 28), 'Accent on dark', 'Badges, chips and soft highlights'),
    }
  }
  return {
    ...base.colors,
    primary: token(primary, base.colors?.primary?.name ?? 'Primary', base.colors?.primary?.usage ?? 'Primary actions and highlights'),
    background: token(hslToHex(h, sat * tintAmount, 99), 'Bright canvas', 'Page and section backgrounds'),
    foreground: token(hslToHex(h, 0.14, 11), 'Ink text', 'Primary text on light surfaces'),
    muted: token(hslToHex(h, sat * tintAmount * 1.6, 95.5), 'Tinted surface', 'Cards, wells and secondary fills'),
    mutedForeground: token(hslToHex(h, 0.08, 42), 'Soft text', 'Secondary text and captions'),
    border: token(hslToHex(h, sat * tintAmount * 1.8, 89), 'Hairline', 'Dividers, outlines and input borders'),
  }
}

function typography(
  base: DesignTokens,
  heading: string,
  body: string,
  letterSpacing?: string,
): DesignTokens['typography'] {
  const prevHeading = fontInList(base.typography?.heading?.family, [heading])
  const prevBody = fontInList(base.typography?.body?.family, [body])
  return {
    ...base.typography,
    heading: {
      ...base.typography?.heading,
      family: prevHeading ?? heading,
      letterSpacing: letterSpacing ?? base.typography?.heading?.letterSpacing ?? '-0.02em',
    },
    body: {
      ...base.typography?.body,
      family: prevBody ?? body,
    },
  }
}

// ---------- The prebuilt style library ----------

export const PREBUILT_STYLES: PrebuiltStyle[] = [
  {
    id: 'apple-hig',
    name: 'Apple-style',
    tagline: 'HIG clarity',
    description:
      'Apple Human Interface language: SF-like Inter type with tight tracking, continuous-corner radii, soft ambient shadows and restrained, barely-tinted surfaces around your brand color.',
    flags: {},
    apply: (base) => {
      const t = cleanFlags(base)
      return {
        ...t,
        colors: surfaces(t, 'light', 0.5),
        typography: typography(t, 'Inter', 'Inter', '-0.022em'),
        radius: { sm: '8px', md: '12px', lg: '20px', full: '9999px' },
        shadows: {
          sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
          md: '0 4px 14px rgba(0, 0, 0, 0.08)',
          lg: '0 16px 40px rgba(0, 0, 0, 0.12)',
        },
        buttons: { ...t.buttons, shape: 'rounded' },
      }
    },
  },
  {
    id: 'liquid-glass',
    name: 'Liquid Glass',
    tagline: 'GlassyUI frosted',
    description:
      'The glassyui look: translucent frosted surfaces with real backdrop blur over a brand-tinted gradient canvas, hairline white borders and glowy depth shadows — Apple keynote glass, built from your colors.',
    flags: { glass: true },
    apply: (base) => {
      const t = cleanFlags(base)
      return {
        ...t,
        colors: surfaces(t, 'light', 1.2),
        typography: typography(t, 'Manrope', 'Inter', '-0.015em'),
        radius: { sm: '12px', md: '18px', lg: '28px', full: '9999px' },
        shadows: {
          sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
          md: '0 8px 32px rgba(15, 23, 42, 0.12)',
          lg: '0 24px 60px rgba(15, 23, 42, 0.18)',
        },
        buttons: { ...t.buttons, shape: 'rounded' },
        style: { glass: true },
      }
    },
  },
  {
    id: 'google-glow',
    name: 'Google glow',
    tagline: 'Material focus ring',
    description:
      'Google-style Material surfaces with the signature glowing edge — a soft colored halo on the selected components only (primary buttons + focused inputs). Crisp 8px radii, flat but alive.',
    flags: { glow: true },
    apply: (base) => {
      const t = cleanFlags(base)
      return {
        ...t,
        colors: surfaces(t, 'light', 0.25),
        typography: typography(t, 'IBM Plex Sans', 'IBM Plex Sans', '-0.005em'),
        radius: { sm: '4px', md: '8px', lg: '12px', full: '9999px' },
        shadows: {
          sm: '0 1px 2px rgba(60, 64, 67, 0.16)',
          md: '0 1px 3px rgba(60, 64, 67, 0.30), 0 2px 6px 1px rgba(60, 64, 67, 0.15)',
          lg: '0 4px 8px 1px rgba(60, 64, 67, 0.15), 0 8px 20px 2px rgba(60, 64, 67, 0.15)',
        },
        buttons: { ...t.buttons, shape: 'rounded' },
        style: { glow: true },
      }
    },
  },
  {
    id: 'notion-minimal',
    name: 'Notion minimal',
    tagline: 'Quiet documents',
    description:
      'Notion document calm: near-monochrome ink on paper, hairline borders, no shadows, tight small radii. Your brand color speaks only through primary actions.',
    flags: {},
    apply: (base) => {
      const t = cleanFlags(base)
      const primary = roleHex(t, 'primary')
      const { h } = hexToHsl(primary)
      return {
        ...t,
        colors: {
          ...t.colors,
          background: token('#FFFFFF', 'Paper', 'Page and section backgrounds'),
          foreground: token('#25251F', 'Ink', 'Primary text on paper'),
          muted: token('#F7F7F5', 'Paper well', 'Cards, wells and secondary fills'),
          mutedForeground: token('#787774', 'Graphite text', 'Secondary text and captions'),
          border: token('#E9E9E7', 'Hairline', 'Dividers, outlines and input borders'),
          secondary: token('#F1F1EF', 'Soft fill', 'Secondary fills and chips'),
          accent: token(hslToHex(h, Math.min(hexToHsl(primary).s, 0.5), 94), 'Soft brand tint', 'Badges and highlights'),
        },
        typography: typography(t, 'Inter', 'Inter', '-0.01em'),
        radius: { sm: '3px', md: '6px', lg: '10px', full: '9999px' },
        shadows: { sm: 'none', md: 'none', lg: 'none' },
        buttons: { ...t.buttons, shape: 'rounded' },
      }
    },
  },
  {
    id: 'stripe-gradient',
    name: 'Stripe gradient',
    tagline: 'SaaS hero wash',
    description:
      'The Stripe playbook: crisp 6px geometry, saturated brand color, tight type — and the hero gets a brand-tinted gradient wash that fades into the page. Engineered and optimistic.',
    flags: { gradientHero: true },
    apply: (base) => {
      const t = cleanFlags(base)
      return {
        ...t,
        colors: surfaces(t, 'light', 0.35),
        typography: typography(t, 'Inter', 'Inter', '-0.02em'),
        radius: { sm: '4px', md: '6px', lg: '10px', full: '9999px' },
        shadows: {
          sm: '0 1px 2px rgba(10, 15, 30, 0.08)',
          md: '0 4px 10px rgba(10, 15, 30, 0.10)',
          lg: '0 15px 35px rgba(10, 15, 30, 0.14)',
        },
        buttons: { ...t.buttons, shape: 'rounded' },
        style: { gradientHero: true },
      }
    },
  },
  {
    id: 'linear-dark',
    name: 'Linear dark',
    tagline: 'Neon product glow',
    description:
      'Linear-grade dark product UI: deep tinted surfaces, Space Grotesk headings, precise radii and a subtle primary glow on interactive edges. Built for developer-tool gravitas.',
    flags: { glow: true },
    apply: (base) => {
      const t = cleanFlags(base)
      return {
        ...t,
        colors: surfaces(t, 'dark', 0.4),
        typography: typography(t, 'Space Grotesk', 'Inter', '-0.01em'),
        radius: { sm: '6px', md: '10px', lg: '16px', full: '9999px' },
        shadows: {
          sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
          md: '0 4px 14px rgba(0, 0, 0, 0.45)',
          lg: '0 16px 44px rgba(0, 0, 0, 0.55)',
        },
        buttons: { ...t.buttons, shape: 'rounded' },
        style: { glow: true },
      }
    },
  },
]

export function findPrebuiltStyle(id: string | null): PrebuiltStyle | null {
  if (!id) return null
  return PREBUILT_STYLES.find((s) => s.id === id) ?? null
}

export function applyPrebuiltStyle(base: DesignTokens, id: string | null): DesignTokens {
  const style = findPrebuiltStyle(id)
  return style ? style.apply(base) : base
}
