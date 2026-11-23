'use client'

import type { CSSProperties, ReactNode } from 'react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ShieldCheck,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react'
import type { ColorRole, DesignTokens, PreviewFeatureIcon } from '@/lib/types'
import { DEFAULT_PREVIEW_COPY } from '@/lib/types'
import { getCursorPack, type CursorPack } from '@/lib/cursor-packs'

// ---------- Color helpers (exported for the visual editor) ----------

export const FALLBACK_HEX: Record<ColorRole, string> = {
  primary: '#059669',
  primaryForeground: '#ffffff',
  secondary: '#f4f4f5',
  accent: '#ecfdf5',
  background: '#ffffff',
  foreground: '#18181b',
  muted: '#f4f4f5',
  mutedForeground: '#71717a',
  border: '#e4e4e7',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
}

export function isHex(value: string | undefined | null): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
}

/** Expand #abc -> #aabbcc so rgba math works on short hex too. */
function expandHex(hex: string): string | null {
  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) return hex
  const m = /^#([0-9A-Fa-f]{3})$/.exec(hex)
  if (!m) return null
  return `#${m[1]
    .split('')
    .map((ch) => ch + ch)
    .join('')}`
}

/** Hex -> rgba string with the given alpha (0-1). */
export function withAlpha(hex: string, alpha: number): string {
  const full = expandHex(hex)
  if (!full) return hex
  const n = parseInt(full.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Mix two hex colors (t = 0 keeps a, t = 1 returns b). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = expandHex(a)
  const cb = expandHex(b)
  if (!ca || !cb) return a
  const k = Math.max(0, Math.min(1, t))
  const pa = parseInt(ca.slice(1), 16)
  const pb = parseInt(cb.slice(1), 16)
  const ch = (sa: number, sb: number) =>
    Math.round(sa + (sb - sa) * k)
      .toString(16)
      .padStart(2, '0')
  const r = ch((pa >> 16) & 255, (pb >> 16) & 255)
  const g = ch((pa >> 8) & 255, (pb >> 8) & 255)
  const bl = ch(pa & 255, pb & 255)
  return `#${r}${g}${bl}`
}

/** Pick black or white text depending on background luminance. */
export function readableOn(bgHex: string): string {
  const full = expandHex(bgHex)
  if (!full) return '#ffffff'
  const n = parseInt(full.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  return lum > 160 ? '#18181b' : '#ffffff'
}

// ---------- Live preview ----------

interface LivePreviewProps {
  tokens: DesignTokens
}

const FALLBACK_SCALE = {
  h1: '2.5rem',
  h2: '1.875rem',
  h3: '1.5rem',
  h4: '1.25rem',
  body: '1rem',
  small: '0.875rem',
  caption: '0.75rem',
}

const FALLBACK_RADIUS = { sm: '6px', md: '10px', lg: '16px', full: '9999px' }

const FALLBACK_SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
}

/**
 * Scoped effect CSS for the style feature toggles (Google RGB glow, the
 * Vision Pictures pill buttons). Rendered once inside the preview root so
 * nothing leaks into the surrounding app shell.
 *
 * - RGB glow: the animated conic-gradient border Google uses on its Gemini
 *   AI action elements - implemented with @property + conic-gradient so the
 *   color rotation travels around the component, with a blurred halo layer
 *   behind a crisp masked ring. Reduced-motion users get a static gradient.
 * - Pill buttons: CSS adaptations of the uploaded Vision Pictures pack -
 *   "Plastic" (inflated foil pill, gloss top, press depth) recolored to the
 *   brand primary via CSS vars, and "Venom" (matte black pill with a brand
 *   under-glow and springy press). © Vision Pictures LLC - license permits
 *   use/modification inside the licensee's own projects.
 */
const PREVIEW_EFFECT_CSS = `
@property --df-rgb-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes df-rgb-spin { to { --df-rgb-angle: 360deg; } }
.df-preview .df-rgb { position: relative; isolation: isolate; }
.df-preview .df-rgb::before {
  content: ''; position: absolute; inset: -4px;
  border-radius: calc(var(--df-r, 12px) + 4px);
  background: conic-gradient(from var(--df-rgb-angle) at 50% 50%, #ea4335, #fbbc04, #34a853, #4285f4, #ea4335);
  filter: blur(9px); opacity: .5; z-index: -1;
  animation: df-rgb-spin 3.6s linear infinite;
  pointer-events: none;
}
.df-preview .df-rgb::after {
  content: ''; position: absolute; inset: -1.5px; padding: 1.5px;
  border-radius: calc(var(--df-r, 12px) + 1.5px);
  background: conic-gradient(from var(--df-rgb-angle) at 50% 50%, #ea4335, #fbbc04, #34a853, #4285f4, #ea4335);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  z-index: 1;
  animation: df-rgb-spin 3.6s linear infinite;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .df-preview .df-rgb::before, .df-preview .df-rgb::after { animation: none; }
}
.df-preview .df-btn-plastic {
  position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 11px 22px; border-radius: 999px; cursor: pointer;
  font-weight: 600; line-height: 1; white-space: nowrap;
  color: var(--df-pt, #fff); text-shadow: 0 1px 2px rgba(0, 0, 0, .35);
  filter: drop-shadow(0 7px 10px rgba(0, 0, 0, .25));
  background: transparent;
  transition: transform .18s ease, filter .18s ease;
}
.df-preview .df-btn-plastic::before {
  content: ''; position: absolute; inset: 0; border-radius: 999px; z-index: 0;
  background: radial-gradient(120% 95% at 50% 0%, var(--df-p1, #ff8a65) 0%, var(--df-p2, #d8261a) 38%, var(--df-p3, #8f1010) 75%, var(--df-p4, #3a0505) 100%);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .45);
}
.df-preview .df-btn-plastic::after {
  content: ''; position: absolute; inset: 0; border-radius: 999px; z-index: 1; pointer-events: none;
  background: linear-gradient(180deg, rgba(255,255,255,.5) 0%, rgba(255,255,255,.16) 20%, rgba(255,255,255,0) 46%, rgba(0,0,0,.12) 72%, rgba(0,0,0,.32) 100%);
}
.df-preview .df-btn-plastic > span { position: relative; z-index: 2; }
.df-preview .df-btn-plastic:hover { filter: drop-shadow(0 9px 13px rgba(0, 0, 0, .3)) brightness(1.05); transform: translateY(-1px); }
.df-preview .df-btn-plastic:active { transform: translateY(0) scale(.985); filter: drop-shadow(0 4px 6px rgba(0, 0, 0, .28)) brightness(.94); }
.df-preview .df-btn-plastic:focus-visible { outline: 2px solid var(--df-p1, #ffb8a8); outline-offset: 4px; }
.df-preview .df-btn-venom {
  position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center;
  border: 0; padding: 11px 26px; border-radius: 999px; cursor: pointer;
  font-weight: 700; line-height: 1; white-space: nowrap; color: #fff;
  background: radial-gradient(130% 100% at 50% 0%, #3b3b3b 0%, #161616 38%, #060606 72%, #000 100%);
  box-shadow: 0 14px 22px -10px rgba(0, 0, 0, .55), 0 3px 4px -1px rgba(0, 0, 0, .35), 0 8px 30px -8px var(--df-vg, rgba(0, 0, 0, .4));
  transition: transform .45s cubic-bezier(.3, 1.6, .45, 1);
}
.df-preview .df-btn-venom > span { position: relative; z-index: 1; text-shadow: 0 1px 2px rgba(0, 0, 0, .8); }
.df-preview .df-btn-venom:hover { transform: scale(1.03); }
.df-preview .df-btn-venom:active { transform: scale(.96); transition-duration: .12s; }
.df-preview .df-btn-venom:focus-visible { outline: 2px solid #9a9a9a; outline-offset: 5px; }
`

/** Bump a "12px" radius string by a few pixels (pill radii pass through). */
function bumpRadius(value: string, extra: number): string {
  if (/^9{3,}px$/.test(value.trim())) return value
  const m = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  if (!m) return value
  return `${Math.round(parseFloat(m[1])) + extra}px`
}

/**
 * Scoped cursor CSS for the "Cursor styles" feature. Renders the pack's
 * three states - base arrow on everything, link pointer on interactive
 * targets, text beam on fields (and `.df-cursor-text` demo zones). All
 * rules carry `!important` so Tailwind's `cursor-pointer` buttons and the
 * UA stylesheet can't leak the system cursor back in.
 */
function cursorScopeCss(pack: CursorPack): string {
  return [
    `.df-cursor-active, .df-cursor-active * { cursor: ${pack.base} !important; }`,
    `.df-cursor-active button, .df-cursor-active a, .df-cursor-active [role='button'], .df-cursor-active .df-cursor-link { cursor: ${pack.link} !important; }`,
    `.df-cursor-active input:not([type='checkbox']):not([type='radio']), .df-cursor-active textarea, .df-cursor-active [contenteditable='true'], .df-cursor-active .df-cursor-text { cursor: ${pack.text} !important; }`,
  ].join('\n')
}

/**
 * A self-contained brand gallery rendered purely from design tokens.
 * Every color, font, radius and shadow derives from the token object.
 */
export function LivePreview({ tokens }: LivePreviewProps) {
  const color = (role: ColorRole): string => {
    const hex = tokens.colors?.[role]?.hex
    return isHex(hex) ? hex : FALLBACK_HEX[role]
  }

  const primary = color('primary')
  const primaryForeground = color('primaryForeground')
  const secondary = color('secondary')
  const background = color('background')
  const foreground = color('foreground')
  const muted = color('muted')
  const mutedForeground = color('mutedForeground')
  const border = color('border')
  const success = color('success')
  const warning = color('warning')
  const danger = color('danger')

  const headingFamily = `'${tokens.typography?.heading?.family ?? 'Inter'}', ui-sans-serif, system-ui, sans-serif`
  const bodyFamily = `'${tokens.typography?.body?.family ?? 'Inter'}', ui-sans-serif, system-ui, sans-serif`
  const lineHeight = tokens.typography?.body?.lineHeight ?? '1.6'
  const headingSpacing = tokens.typography?.heading?.letterSpacing ?? '-0.02em'
  const scale = { ...FALLBACK_SCALE, ...(tokens.typography?.scale ?? {}) }
  const radius = { ...FALLBACK_RADIUS, ...(tokens.radius ?? {}) }
  const shadows = { ...FALLBACK_SHADOWS, ...(tokens.shadows ?? {}) }

  // ---------- Style feature toggles (Liquid Glass / Google RGB glow / …) ----------
  const styleFlags = tokens.style ?? {}
  const glass = styleFlags.glass === true
  const glow = styleFlags.glow === true
  const gradientHero = styleFlags.gradientHero === true
  const softAmbient = styleFlags.softAmbient === true
  const buttonPreset =
    styleFlags.buttonPreset === 'plastic' || styleFlags.buttonPreset === 'venom'
      ? styleFlags.buttonPreset
      : null
  const cursorPack = getCursorPack(styleFlags.cursorPack)
  const accent = color('accent')

  // Soft ambient (Apple HIG-style) depth - layered over the token shadows.
  const ambientCardShadow = '0 2px 6px rgba(15, 23, 42, 0.05), 0 12px 34px rgba(15, 23, 42, 0.10), 0 32px 80px rgba(15, 23, 42, 0.06)'
  const ambientBtnShadow = '0 1px 2px rgba(15, 23, 42, 0.05), 0 10px 26px rgba(15, 23, 42, 0.12)'
  const cardRadius = softAmbient ? bumpRadius(radius.lg, 6) : radius.lg
  const btnRadius = softAmbient ? bumpRadius(radius.md, 4) : radius.md

  /** Wrap a selected component in the animated Google-style RGB glow ring. */
  const rgbGlow = (child: ReactNode, radiusForRing: string, block = false): ReactNode =>
    glow ? (
      <span
        className="df-rgb"
        style={{
          ...(block ? { display: 'block' } : { display: 'inline-flex' }),
          '--df-r': radiusForRing,
        } as unknown as CSSProperties}
      >
        {child}
      </span>
    ) : (
      child
    )

  /** The primary CTA - rendered with the pill preset or the token style. */
  const primaryButton = (label: string, opts?: { width?: string }) => {
    const inner = buttonPreset ? (
      <button
        type="button"
        className={buttonPreset === 'plastic' ? 'df-btn-plastic' : 'df-btn-venom'}
        style={
          {
            fontFamily: bodyFamily,
            fontSize: scale.small,
            ...(opts?.width ? { width: opts.width } : {}),
            ...(buttonPreset === 'plastic'
              ? {
                  '--df-p1': mixHex(primary, '#ffffff', 0.45),
                  '--df-p2': primary,
                  '--df-p3': mixHex(primary, '#000000', 0.52),
                  '--df-p4': mixHex(primary, '#000000', 0.78),
                  '--df-pt': readableOn(mixHex(primary, '#000000', 0.52)),
                }
              : { '--df-vg': withAlpha(primary, 0.4) }),
          } as CSSProperties
        }
      >
        <span>{label}</span>
      </button>
    ) : (
      <button
        type="button"
        style={{
          ...btnBase,
          borderRadius: btnRadius,
          background: primary,
          color: primaryForeground,
          boxShadow: glow ? undefined : softAmbient ? ambientBtnShadow : shadows.md,
          ...(opts?.width ? { width: opts.width } : {}),
        }}
      >
        {label}
      </button>
    )
    return rgbGlow(inner, buttonPreset ? '999px' : btnRadius, Boolean(opts?.width))
  }

  // Liquid-glass surfaces: translucent white (or dark) panes with real
  // backdrop blur, floating over a brand-tinted gradient canvas.
  const isDarkCanvas = readableOn(background) === '#ffffff'
  const glassTintRgb = isDarkCanvas ? '22, 26, 36' : '255, 255, 255'
  const glassSurface = `rgba(${glassTintRgb}, ${isDarkCanvas ? 0.6 : 0.55})`
  const glassInputSurface = `rgba(${glassTintRgb}, ${isDarkCanvas ? 0.4 : 0.45})`
  const glassBorder = isDarkCanvas ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.6)'
  const glassBlur = 'blur(18px) saturate(1.6)'

  const brandName = tokens.brand?.name?.trim() || 'Your brand'
  const initial = brandName.charAt(0).toUpperCase()
  const trustPatterns = (tokens.trustPatterns ?? []).filter((t) => t.trim().length > 0)

  // Domain-aware microcopy generated with the design (falls back to neutral copy).
  const copy = tokens.previewCopy ?? DEFAULT_PREVIEW_COPY
  const copy_ = {
    navLinks: copy.navLinks.length >= 2 ? copy.navLinks : DEFAULT_PREVIEW_COPY.navLinks,
    navCta: copy.navCta || DEFAULT_PREVIEW_COPY.navCta,
    heroHeadline: copy.heroHeadline || DEFAULT_PREVIEW_COPY.heroHeadline,
    heroSubhead: copy.heroSubhead || DEFAULT_PREVIEW_COPY.heroSubhead,
    primaryCta: copy.primaryCta || DEFAULT_PREVIEW_COPY.primaryCta,
    secondaryCta: copy.secondaryCta || DEFAULT_PREVIEW_COPY.secondaryCta,
    featureCards: copy.featureCards.length ? copy.featureCards : DEFAULT_PREVIEW_COPY.featureCards,
    pricingFeatures: copy.pricing.features.length >= 3 ? copy.pricing.features : DEFAULT_PREVIEW_COPY.pricing.features,
    testimonial: copy.testimonial.author ? copy.testimonial : DEFAULT_PREVIEW_COPY.testimonial,
    alerts: copy.alerts,
  }

  const FEATURE_ICONS: Record<PreviewFeatureIcon, typeof Sparkles> = {
    sparkles: Sparkles,
    shield: ShieldCheck,
    zap: Zap,
    check: CheckCircle2,
  }

  const btnBase: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '10px 18px',
    borderRadius: btnRadius,
    fontSize: scale.small,
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
    border: glass ? `1px solid ${glassBorder}` : '1px solid transparent',
    whiteSpace: 'nowrap',
  }
  const cardBase: CSSProperties = {
    background: glass ? glassSurface : background,
    border: `1px solid ${glass ? glassBorder : border}`,
    borderRadius: cardRadius,
    boxShadow: glass ? '0 8px 32px rgba(15, 23, 42, 0.12)' : softAmbient ? ambientCardShadow : shadows.sm,
    ...(glass ? { backdropFilter: glassBlur, WebkitBackdropFilter: glassBlur } : {}),
  }
  const inputBase: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: radius.md,
    border: `1px solid ${glass ? glassBorder : border}`,
    background: glass ? glassInputSurface : background,
    color: foreground,
    fontSize: scale.small,
    fontFamily: bodyFamily,
    outline: 'none',
    boxSizing: 'border-box',
    ...(glass ? { backdropFilter: glassBlur, WebkitBackdropFilter: glassBlur } : {}),
  }

  const navLinks = copy_.navLinks

  return (
    <div
      className={`df-preview max-h-[720px] overflow-y-auto rounded-lg border df-scroll${cursorPack ? ' df-cursor-active' : ''}`}
      style={{ borderColor: border }}
      role="region"
      aria-label="Live component preview built from design tokens"
    >
      {/* Scoped effect CSS for the style feature toggles */}
      <style>{PREVIEW_EFFECT_CSS}</style>
      {/* Scoped cursor CSS - only when a cursor pack is switched on */}
      {cursorPack && <style>{cursorScopeCss(cursorPack)}</style>}
      {/* Token-styled canvas - everything below derives from tokens */}
      <div
        style={{
          background: glass
            ? `linear-gradient(135deg, ${mixHex(background, primary, 0.18)} 0%, ${background} 45%, ${mixHex(background, accent, 0.16)} 100%)`
            : background,
          color: foreground,
          fontFamily: bodyFamily,
          lineHeight,
          fontSize: scale.body,
        }}
      >
        {/* (a) Navbar */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            padding: '16px 24px',
            borderBottom: `1px solid ${glass ? glassBorder : border}`,
            flexWrap: 'wrap',
            ...(glass
              ? {
                  background: glassSurface,
                  backdropFilter: glassBlur,
                  WebkitBackdropFilter: glassBlur,
                  position: 'sticky' as const,
                  top: 0,
                  zIndex: 5,
                }
              : {}),
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: radius.md,
                background: primary,
                color: primaryForeground,
                fontWeight: 800,
                fontSize: scale.small,
                fontFamily: headingFamily,
              }}
            >
              {initial}
            </span>
            <span style={{ fontWeight: 700, fontFamily: headingFamily, fontSize: scale.body }}>
              {brandName}
            </span>
          </span>
          <nav
            aria-hidden="true"
            style={{ display: 'flex', alignItems: 'center', gap: 20 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              {navLinks.map((link) => (
                <span key={link} style={{ fontSize: scale.small, color: mutedForeground }}>
                  {link}
                </span>
              ))}
            </div>
            {primaryButton(copy_.navCta)}
          </nav>
        </header>

        {/* (b) Hero */}
        <section
          style={{
            padding: '56px 24px',
            textAlign: 'center',
            ...(gradientHero
              ? {
                  background: `linear-gradient(160deg, ${withAlpha(primary, 0.16)} 0%, ${withAlpha(accent, 0.12)} 55%, transparent 85%)`,
                }
              : {}),
          }}
        >
          <h1
            style={{
              fontFamily: headingFamily,
              fontWeight: 800,
              fontSize: scale.h1,
              letterSpacing: headingSpacing,
              lineHeight: 1.1,
              margin: '0 auto',
              maxWidth: 640,
            }}
          >
            {copy_.heroHeadline}
          </h1>
          <p
            style={{
              marginTop: 16,
              marginBottom: 24,
              color: mutedForeground,
              fontSize: scale.body,
              maxWidth: 520,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            {copy_.heroSubhead}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
              marginBottom: 20,
            }}
          >
            {primaryButton(copy_.primaryCta)}
            <button
              type="button"
              style={{ ...btnBase, border: `1px solid ${border}`, color: foreground, background: 'transparent' }}
            >
              {copy_.secondaryCta}
            </button>
          </div>
          {trustPatterns.length > 0 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {trustPatterns.slice(0, 3).map((pattern) => (
                <span
                  key={pattern}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: radius.full,
                    background: muted,
                    color: mutedForeground,
                    fontSize: scale.caption,
                  }}
                >
                  <ShieldCheck size={13} style={{ color: success }} />
                  {pattern}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* (c) Buttons */}
        <Section pad="24px" label="Buttons">
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {primaryButton('Primary')}
            <button type="button" style={{ ...btnBase, background: secondary, color: foreground }}>
              Secondary
            </button>
            <button
              type="button"
              style={{ ...btnBase, background: 'transparent', color: foreground, border: `1px solid ${border}` }}
            >
              Outline
            </button>
            <button type="button" style={{ ...btnBase, background: 'transparent', color: foreground }}>
              Ghost
            </button>
            <button type="button" style={{ ...btnBase, background: danger, color: readableOn(danger) }}>
              Destructive
            </button>
            <button
              type="button"
              style={{
                ...btnBase,
                background: muted,
                color: mutedForeground,
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
              disabled
            >
              Disabled
            </button>
          </div>
        </Section>

        {/* (d) Badges */}
        <Section pad="24px" label="Badges">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: radius.full,
                background: primary,
                color: primaryForeground,
                fontSize: scale.caption,
                fontWeight: 600,
              }}
            >
              Primary
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: radius.full,
                background: withAlpha(success, 0.12),
                color: success,
                fontSize: scale.caption,
                fontWeight: 600,
              }}
            >
              Success
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: radius.full,
                background: withAlpha(warning, 0.12),
                color: warning,
                fontSize: scale.caption,
                fontWeight: 600,
              }}
            >
              Warning
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: radius.full,
                background: withAlpha(danger, 0.12),
                color: danger,
                fontSize: scale.caption,
                fontWeight: 600,
              }}
            >
              Danger
            </span>
          </div>
        </Section>

        {/* (e) Form card */}
        <Section pad="24px" label="Forms">
          <div style={{ ...cardBase, padding: 24, maxWidth: 460 }}>
            <div style={{ display: 'grid', gap: 16 }}>
              <label style={{ display: 'grid', gap: 6, fontSize: scale.small, fontWeight: 600 }}>
                Full name
                <input type="text" readOnly value="Jane Cooper" style={inputBase} />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: scale.small, fontWeight: 600 }}>
                Work email
                {glow ? (
                  <span
                    className="df-rgb"
                    style={{ display: 'block', '--df-r': radius.md } as unknown as CSSProperties}
                  >
                    <input
                      type="text"
                      readOnly
                      value="jane@company.com"
                      aria-label="Work email (focused state)"
                      style={{ ...inputBase, borderColor: primary }}
                    />
                  </span>
                ) : (
                  <input
                    type="text"
                    readOnly
                    value="jane@company.com"
                    aria-label="Work email (focused state)"
                    style={inputBase}
                  />
                )}
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: scale.small, fontWeight: 600 }}>
                Anything we should know?
                <textarea readOnly rows={3} defaultValue="We invoice about 40 clients a month." style={{ ...inputBase, resize: 'none' }} />
              </label>
              <div style={{ position: 'relative' }}>
                <label style={{ display: 'grid', gap: 6, fontSize: scale.small, fontWeight: 600 }}>
                  Country
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...inputBase, display: 'inline-flex', alignItems: 'center', color: mutedForeground }}>
                      Choose an option
                    </span>
                    <ChevronDown
                      size={15}
                      style={{ position: 'absolute', right: 12, bottom: 10, color: mutedForeground }}
                    />
                  </span>
                </label>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: scale.small, color: mutedForeground }}>
                <input type="checkbox" defaultChecked readOnly style={{ accentColor: primary, width: 15, height: 15 }} />
                Email me product updates
              </label>
              {rgbGlow(
                <button
                  type="button"
                  style={{
                    ...btnBase,
                    background: primary,
                    color: primaryForeground,
                    width: '100%',
                  }}
                >
                  Create account
                </button>,
                btnRadius,
                true,
              )}
            </div>
          </div>
        </Section>

        {/* (f) Feature cards */}
        <Section pad="24px" label="Features">
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {copy_.featureCards.map(({ icon, title, text }) => {
              const Icon = FEATURE_ICONS[icon] ?? Sparkles
              return (
              <div key={title} style={{ ...cardBase, padding: 20 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: radius.md,
                    background: withAlpha(primary, 0.12),
                    color: primary,
                    marginBottom: 12,
                  }}
                >
                  <Icon size={17} />
                </span>
                <h3 style={{ fontFamily: headingFamily, fontWeight: 700, fontSize: scale.h4, margin: 0 }}>
                  {title}
                </h3>
                <p style={{ marginTop: 6, color: mutedForeground, fontSize: scale.small }}>{text}</p>
              </div>
              )
            })}
          </div>
        </Section>

        {/* (g) Pricing card */}
        <Section pad="24px" label="Pricing">
          <div
            style={{
              ...cardBase,
              padding: 24,
              maxWidth: 380,
              border: `2px solid ${primary}`,
              boxShadow: shadows.lg,
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: -12,
                left: 24,
                padding: '4px 12px',
                borderRadius: radius.full,
                background: primary,
                color: primaryForeground,
                fontSize: scale.caption,
                fontWeight: 700,
              }}
            >
              Most popular
            </span>
            <h3 style={{ fontFamily: headingFamily, fontWeight: 700, fontSize: scale.h3, margin: '6px 0 4px' }}>
              Growth
            </h3>
            <p style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: headingFamily, fontWeight: 800, fontSize: scale.h2 }}>$29</span>
              <span style={{ color: mutedForeground, fontSize: scale.small }}>/ month</span>
            </p>
            <ul style={{ listStyle: 'none', margin: '16px 0', padding: 0, display: 'grid', gap: 10 }}>
              {copy_.pricingFeatures.map((feature) => (
                <li key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: scale.small }}>
                  <Check size={15} style={{ color: success, flexShrink: 0 }} />
                  {feature}
                </li>
              ))}
            </ul>
            {primaryButton('Choose Growth', { width: '100%' })}
          </div>
        </Section>

        {/* (h) Testimonial */}
        <Section pad="24px" label="Social proof">
          <div
            style={{
              background: muted,
              borderRadius: radius.lg,
              padding: 24,
              maxWidth: 520,
            }}
          >
            <p style={{ fontSize: scale.body, color: foreground, margin: 0 }}>
              “{copy_.testimonial.quote}”
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: radius.full,
                  background: primary,
                  color: primaryForeground,
                  fontWeight: 700,
                  fontSize: scale.small,
                }}
              >
                {copy_.testimonial.author.charAt(0).toUpperCase()}
              </span>
              <span>
                <span style={{ display: 'block', fontWeight: 600, fontSize: scale.small }}>{copy_.testimonial.author}</span>
                <span style={{ display: 'block', color: mutedForeground, fontSize: scale.caption }}>
                  {copy_.testimonial.role}
                </span>
              </span>
            </div>
          </div>
        </Section>

        {/* (i) Stats strip */}
        <Section pad="24px" label="Stats">
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 24,
              justifyContent: 'space-around',
              borderTop: `1px solid ${border}`,
              borderBottom: `1px solid ${border}`,
              padding: '24px 0',
            }}
          >
            {[
              { value: '98%', label: 'Satisfaction' },
              { value: '12k+', label: 'Teams onboarded' },
              { value: '4.9/5', label: 'Average review' },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <p
                  style={{
                    fontFamily: headingFamily,
                    fontWeight: 800,
                    fontSize: scale.h2,
                    letterSpacing: headingSpacing,
                    margin: 0,
                  }}
                >
                  {stat.value}
                </p>
                <p style={{ color: mutedForeground, fontSize: scale.small, marginTop: 2 }}>{stat.label}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* (j) Alerts */}
        <Section pad="24px" label="Alerts">
          <div style={{ display: 'grid', gap: 12 }}>
            {[
              { tone: success, icon: CheckCircle2, ...copy_.alerts.success },
              { tone: warning, icon: AlertTriangle, ...copy_.alerts.warning },
              { tone: danger, icon: XCircle, ...copy_.alerts.danger },
            ].map(({ tone, icon: Icon, title, text }) => (
              <div
                key={title}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  background: withAlpha(tone, 0.1),
                  borderLeft: `3px solid ${tone}`,
                  borderRadius: radius.md,
                  padding: '14px 16px',
                }}
              >
                <Icon size={17} style={{ color: tone, flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: scale.small, margin: 0, color: tone }}>{title}</p>
                  <p style={{ fontSize: scale.small, color: foreground, marginTop: 2 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* (k) Type scale */}
        <Section pad="24px" label="Type scale">
          <div style={{ display: 'grid', gap: 10 }}>
            {(
              [
                ['h1', 'Build trust in every pixel'],
                ['h2', 'Design systems that ship'],
                ['h3', 'Tokens, preview, export'],
                ['h4', 'Consistent by default'],
                ['body', 'Body copy stays readable with a comfortable line height across all screens.'],
                ['small', 'Small text for captions, helpers and secondary information.'],
                ['caption', 'CAPTION FOR LABELS AND METADATA'],
              ] as const
            ).map(([key, sample]) => (
              <div key={key} style={{ borderBottom: `1px dashed ${border}`, paddingBottom: 10 }}>
                <span
                  style={{
                    fontFamily: 'ui-monospace, monospace',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: mutedForeground,
                    display: 'block',
                    marginBottom: 4,
                  }}
                >
                  {key}
                </span>
                <span
                  style={{
                    fontFamily: ['h1', 'h2', 'h3', 'h4'].includes(key) ? headingFamily : bodyFamily,
                    fontWeight: key === 'h1' ? 800 : key === 'body' ? 400 : 600,
                    fontSize: scale[key],
                    letterSpacing: ['h1', 'h2', 'h3', 'h4'].includes(key) ? headingSpacing : 'normal',
                  }}
                >
                  {sample}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* (k2) Cursor demo strip - lets you feel every state of the active cursor pack */}
        {cursorPack && (
          <Section pad="24px" label="Cursor">
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              }}
            >
              {/* Mouse state - base arrow on plain surfaces */}
              <div
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: radius.md,
                  padding: 16,
                  background: muted,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: mutedForeground,
                  }}
                >
                  Mouse
                </span>
                <p style={{ margin: '6px 0 0', fontSize: scale.caption, color: foreground }}>
                  Hover this panel - the base cursor takes over the whole surface.
                </p>
              </div>
              {/* Link state - pointer on click targets */}
              <div
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: radius.md,
                  padding: 16,
                  background: muted,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: mutedForeground,
                  }}
                >
                  Link
                </span>
                <p style={{ margin: '6px 0 0', fontSize: scale.caption, color: foreground }}>
                  <span
                    className="df-cursor-link"
                    style={{ textDecoration: 'underline', textUnderlineOffset: 3, color: primary }}
                  >
                    Hover this link to feel the pointer
                  </span>
                </p>
              </div>
              {/* Text state - beam inside text fields */}
              <div
                style={{
                  border: `1px solid ${border}`,
                  borderRadius: radius.md,
                  padding: 16,
                  background: muted,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: mutedForeground,
                  }}
                >
                  Text
                </span>
                <p
                  className="df-cursor-text"
                  style={{ margin: '6px 0 0', fontSize: scale.caption, color: foreground }}
                >
                  Hover this paragraph - the text beam appears. Try selecting me.
                </p>
              </div>
            </div>
            <p style={{ margin: '10px 0 0', fontSize: scale.caption, color: mutedForeground }}>
              {cursorPack.label} cursor pack - mouse, link and text states replace the system cursor across your whole site.
            </p>
          </Section>
        )}

        {/* (l) Mini footer */}
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '20px 24px',
            borderTop: `1px solid ${border}`,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: radius.sm,
                background: primary,
                color: primaryForeground,
                fontWeight: 800,
                fontSize: 11,
              }}
            >
              {initial}
            </span>
            <span style={{ fontWeight: 600, fontSize: scale.small }}>{brandName}</span>
          </span>
          <span style={{ display: 'flex', gap: 16 }}>
            {['Privacy', 'Terms', 'Contact'].map((link) => (
              <span key={link} style={{ fontSize: scale.caption, color: mutedForeground }}>
                {link}
              </span>
            ))}
          </span>
          <span style={{ fontSize: scale.caption, color: mutedForeground }}>
            © {new Date().getFullYear()} {brandName}
          </span>
        </footer>
      </div>
    </div>
  )
}

/** Wrapper section with a token-styled label chip. */
function Section({ pad, label, children }: { pad: string; label: string; children: ReactNode }) {
  return (
    <section style={{ padding: pad }}>
      <span
        style={{
          display: 'inline-block',
          marginBottom: 12,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'inherit',
          opacity: 0.55,
        }}
      >
        {label}
      </span>
      {children}
    </section>
  )
}
