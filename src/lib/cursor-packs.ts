import type { CursorPackValue } from '@/lib/types'

/**
 * Cursor PACKS - replaceable system-cursor sets for the "Cursor styles"
 * feature toggle.
 *
 * A pack overrides the three classic cursor states across the whole
 * surface (exactly the Mouse / Link / Text grid from the OS cursor
 * reference):
 * - `base` - the mouse arrow shown on plain surfaces
 * - `link` - the pointer shown on links, buttons and other click targets
 * - `text` - the I-beam shown inside text fields
 *
 * Cursors are embedded as SVG data URIs so they ship with the design
 * tokens (no network requests, work in the dev environment preview). Vector
 * shapes are derived from the Lucide icon geometry (ISC license):
 * `mouse-pointer-2` for the arrow, `pointer` for the hand and
 * `text-cursor` for the I-beam. Line-art shapes get a white "casing"
 * stroke underneath the ink stroke so they stay visible on dark canvases.
 *
 * Browser rules respected here: SVG cursors need explicit `width`/`height`
 * attributes and should stay ≤ 32px; every `url()` ends with a native
 * keyword fallback so unsupported browsers degrade gracefully.
 */

export type CursorPackId = Exclude<CursorPackValue, ''>

export interface CursorPack {
  id: CursorPackId
  label: string
  description: string
  /** Cursor for the general surface (mouse state). */
  base: string
  /** Cursor for links, buttons and other click targets (link state). */
  link: string
  /** Cursor for text inputs and editable areas (text state). */
  text: string
}

const INK = '#111114'

/** Encode an SVG string into a CSS cursor `url()` value with hotspot + fallback. */
function svgCursor(svg: string, hotspotX: number, hotspotY: number, fallback: string): string {
  const encoded = encodeURIComponent(svg)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27')
  return `url("data:image/svg+xml,${encoded}") ${hotspotX} ${hotspotY}, ${fallback}`
}

/** Render the Lucide arrow path filled - classic pointer look. */
function arrowSvg(fill: string, stroke: string, strokeWidth: number): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 24 24'><path d='M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z' fill='${fill}' stroke='${stroke}' stroke-width='${strokeWidth}' stroke-linejoin='round'/></svg>`
}

/** Lucide `pointer` hand geometry, stroked line-art with a casing pass underneath. */
function handSvg(ink: string, inkWidth: number, casingWidth: number, creases = false): string {
  const paths = `<path d='M22 14a8 8 0 0 1-8 8'/><path d='M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2'/><path d='M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1'/><path d='M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10'/><path d='M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'/>${
    creases ? `<path d='M12.6 13.6v2.4'/><path d='M15.1 13.8v2.4'/>` : ''
  }`
  return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke='#ffffff' stroke-width='${casingWidth}' stroke-linecap='round' stroke-linejoin='round'>${paths}</g><g fill='none' stroke='${ink}' stroke-width='${inkWidth}' stroke-linecap='round' stroke-linejoin='round'>${paths}</g></svg>`
}

/** Lucide `text-cursor` I-beam geometry with a casing pass underneath. */
function beamSvg(ink: string, inkWidth: number, casingWidth: number): string {
  const paths = `<path d='M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1'/><path d='M7 22h1a4 4 0 0 0 4-4v-1'/><path d='M7 2h1a4 4 0 0 1 4 4v1'/>`
  return `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24'><g fill='none' stroke='#ffffff' stroke-width='${casingWidth}' stroke-linecap='round' stroke-linejoin='round'><path d='M7 22h1a4 4 0 0 0 4-4v-1'/><path d='M7 2h1a4 4 0 0 1 4 4v1'/><path d='M17 22h-1a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4h1'/><path d='M12 6v12'/></g><g fill='none' stroke='${ink}' stroke-width='${inkWidth}' stroke-linecap='round' stroke-linejoin='round'>${paths}<path d='M12 6v12'/></g></svg>`
}

/** Modern dot cursor: quiet dot at rest, ring + center dot on click targets. */
function dotBaseSvg(): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><circle cx='5' cy='5' r='2.7' fill='${INK}' stroke='#ffffff' stroke-width='1.6'/></svg>`
}

function dotLinkSvg(): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><circle cx='10' cy='10' r='7' fill='none' stroke='#ffffff' stroke-width='3'/><circle cx='10' cy='10' r='7' fill='none' stroke='${INK}' stroke-width='1.6'/><circle cx='10' cy='10' r='2' fill='${INK}' stroke='#ffffff' stroke-width='1'/></svg>`
}

function dotTextSvg(): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='18' viewBox='0 0 10 18'><rect x='3.5' y='2' width='3' height='14' rx='1.5' fill='${INK}' stroke='#ffffff' stroke-width='1.3'/></svg>`
}

/** Precision crosshair (crisp custom plus instead of the OS bitmap). */
function crosshairSvg(): string {
  const paths = `<path d='M9 2.2v13.6'/><path d='M2.2 9h13.6'/>`
  return `<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'><g fill='none' stroke='#ffffff' stroke-width='3.2' stroke-linecap='round'>${paths}</g><g fill='none' stroke='${INK}' stroke-width='1.6' stroke-linecap='round'>${paths}</g></svg>`
}

export const CURSOR_PACKS: Record<CursorPackId, CursorPack> = {
  windows: {
    id: 'windows',
    label: 'Windows',
    description: 'Classic white-filled arrow with a hard black outline, outline hand and I-beam - the Windows cursor language.',
    base: svgCursor(arrowSvg('#ffffff', INK, 1.4), 4, 4, 'default'),
    link: svgCursor(handSvg(INK, 1.6, 3.4), 7, 2, 'pointer'),
    text: svgCursor(beamSvg(INK, 1.6, 3.2), 9, 9, 'text'),
  },
  macos: {
    id: 'macos',
    label: 'macOS',
    description: 'Black arrow with a white outline, rounder hand with knuckle creases and a slim I-beam - the macOS cursor language.',
    base: svgCursor(arrowSvg(INK, '#ffffff', 1.2), 4, 4, 'default'),
    link: svgCursor(handSvg('#1d1d20', 1.7, 3.6, true), 7, 2, 'pointer'),
    text: svgCursor(beamSvg('#1d1d20', 1.8, 3.4), 9, 9, 'text'),
  },
  dot: {
    id: 'dot',
    label: 'Modern dot',
    description: 'A quiet minimal dot that grows into a ring over click targets and a slim capsule over text - the modern-site cursor trend.',
    base: svgCursor(dotBaseSvg(), 5, 5, 'default'),
    link: svgCursor(dotLinkSvg(), 10, 10, 'pointer'),
    text: svgCursor(dotTextSvg(), 5, 9, 'text'),
  },
  crosshair: {
    id: 'crosshair',
    label: 'Crosshair',
    description: 'A precise custom crosshair everywhere, text fields keep the beam - built for creative and editing tools.',
    base: svgCursor(crosshairSvg(), 9, 9, 'crosshair'),
    link: svgCursor(crosshairSvg(), 9, 9, 'pointer'),
    text: 'text',
  },
}

const CURSOR_PACK_IDS: readonly CursorPackId[] = ['windows', 'macos', 'dot', 'crosshair']

/** Resolve a stored flag value into a pack; unknown/empty values mean the feature is off. */
export function getCursorPack(value: unknown): CursorPack | null {
  if (typeof value !== 'string') return null
  const id = value as CursorPackId
  return CURSOR_PACK_IDS.includes(id) ? CURSOR_PACKS[id] : null
}
