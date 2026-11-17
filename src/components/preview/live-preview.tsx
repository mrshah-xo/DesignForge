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
    borderRadius: radius.md,
    fontSize: scale.small,
    fontWeight: 600,
    lineHeight: 1,
    cursor: 'pointer',
    border: '1px solid transparent',
    whiteSpace: 'nowrap',
  }
  const cardBase: CSSProperties = {
    background: background,
    border: `1px solid ${border}`,
    borderRadius: radius.lg,
    boxShadow: shadows.sm,
  }
  const inputBase: CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: radius.md,
    border: `1px solid ${border}`,
    background: background,
    color: foreground,
    fontSize: scale.small,
    fontFamily: bodyFamily,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const navLinks = copy_.navLinks

  return (
    <div
      className="max-h-[720px] overflow-y-auto rounded-2xl border df-scroll"
      style={{ borderColor: border }}
      role="region"
      aria-label="Live component preview built from design tokens"
    >
      {/* Token-styled canvas — everything below derives from tokens */}
      <div
        style={{
          background,
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
            borderBottom: `1px solid ${border}`,
            flexWrap: 'wrap',
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
            <button type="button" style={{ ...btnBase, background: primary, color: primaryForeground }}>
              {copy_.navCta}
            </button>
          </nav>
        </header>

        {/* (b) Hero */}
        <section style={{ padding: '56px 24px', textAlign: 'center' }}>
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
            <button type="button" style={{ ...btnBase, background: primary, color: primaryForeground, boxShadow: shadows.md }}>
              {copy_.primaryCta}
            </button>
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
            <button type="button" style={{ ...btnBase, background: primary, color: primaryForeground }}>
              Primary
            </button>
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
                <input type="text" readOnly value="jane@company.com" style={inputBase} />
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
              <button type="button" style={{ ...btnBase, background: primary, color: primaryForeground, width: '100%' }}>
                Create account
              </button>
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
            <button type="button" style={{ ...btnBase, background: primary, color: primaryForeground, width: '100%' }}>
              Choose Growth
            </button>
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
