// ============================================================
// Background suggestion - derives the recommended page backdrop
// from the logo's extracted palette (deterministic, always
// available even when the VLM call fails) and merges the VLM's
// tone/reason opinion when present.
// ============================================================

import type { BackgroundSuggestion, PaletteColor } from '@/lib/types';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function expandHex(hex: string): { r: number; g: number; b: number } | null {
  const full = HEX_RE.test(hex)
    ? hex
    : /^#([0-9A-Fa-f]{3})$/.test(hex)
      ? `#${hex.slice(1).split('').map((c) => c + c).join('')}`
      : null;
  if (!full) return null;
  const n = parseInt(full.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** 0-1 perceptual-ish luminance (simple sRGB weighting). */
function luminance(hex: string): number {
  const rgb = expandHex(hex);
  if (!rgb) return 0.5;
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const rgb = expandHex(hex);
  if (!rgb) return { h: 0, s: 0, l: 0.5 };
  const rn = rgb.r / 255;
  const gn = rgb.g / 255;
  const bn = rgb.b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = ((((h % 360) + 360) % 360) / 360);
  const sn = Math.max(0, Math.min(1, s));
  const ln = Math.max(0, Math.min(1, l));
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return rgbToHex(v, v, v);
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const channel = (t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  return rgbToHex(channel(hn + 1 / 3) * 255, channel(hn) * 255, channel(hn - 1 / 3) * 255);
}

function cleanReason(raw: string | null | undefined): string | null {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if (t.length < 8 || t.length > 320) return null;
  return t;
}

interface HueCluster {
  hue: number;
  sat: number;
  weight: number;
  name: string;
}

/**
 * Cluster palette hues (within 30°) so a multi-shade logo counts as one
 * hue family; returns the heaviest clusters first.
 */
function hueClusters(palette: PaletteColor[]): HueCluster[] {
  const clusters: HueCluster[] = [];
  for (const c of palette) {
    const { h, s } = hexToHsl(c.hex);
    if (s < 0.12) continue; // neutrals carry no hue signal
    const near = clusters.find((cl) => Math.abs(((cl.hue - h + 540) % 360) - 180) >= 150);
    if (near) {
      near.weight += c.weight;
      near.sat = Math.max(near.sat, s);
    } else {
      clusters.push({ hue: h, sat: s, weight: c.weight, name: c.name });
    }
  }
  return clusters.sort((a, b) => b.weight - a.weight);
}

/** Weighted perceived lightness of the palette (0 = deep dark, 1 = white). */
function weightedLuminance(palette: PaletteColor[]): number {
  const total = palette.reduce((sum, c) => sum + Math.max(c.weight, 1), 0) || 1;
  return (
    palette.reduce((sum, c) => sum + luminance(c.hex) * Math.max(c.weight, 1), 0) / total
  );
}

/**
 * Build the recommended page backdrop:
 * - dark/heavily-saturated logos need a light canvas (contrast + breathing room)
 * - pale/white logos need a dark canvas to stay visible
 * - mid-tone vibrant logos get the light web default unless the VLM disagrees
 * Surface hexes are always derived from the palette hue (never VLM raw hex),
 * so the suggestion stays valid even when the model returns junk.
 */
export function buildBackgroundSuggestion(
  palette: PaletteColor[],
  vlmTone?: string | null,
  vlmReason?: string | null,
): BackgroundSuggestion {
  const safePalette = palette.length
    ? palette.filter((c) => expandHex(c.hex))
    : [{ hex: '#71717A', name: 'Neutral Gray', weight: 100 }];
  const dominant = safePalette[0];
  const clusters = hueClusters(safePalette);
  const primary = clusters[0] ?? { hue: hexToHsl(dominant.hex).h, sat: 0.08, weight: 1, name: dominant.name };
  const secondary = clusters[1] ?? null;

  const lum = weightedLuminance(safePalette);
  const satWeighted =
    safePalette.reduce((sum, c) => sum + hexToHsl(c.hex).s * Math.max(c.weight, 1), 0) /
    (safePalette.reduce((sum, c) => sum + Math.max(c.weight, 1), 0) || 1);

  let tone: 'light' | 'dark';
  const vlmNormalized = vlmTone?.toLowerCase();
  if (vlmNormalized === 'light' || vlmNormalized === 'dark') {
    tone = vlmNormalized;
  } else if (lum < 0.42) {
    tone = 'light'; // dark logo - needs a bright canvas
  } else if (lum > 0.66 && satWeighted < 0.22) {
    tone = 'dark'; // pale/white logo - vanishes on white
  } else {
    tone = 'light';
  }

  const mode: 'solid' | 'gradient' = secondary && Math.abs(((primary.hue - secondary.hue + 540) % 360) - 180) > 18 ? 'gradient' : 'solid';

  const from =
    tone === 'light'
      ? hslToHex(primary.hue, Math.min(primary.sat * 0.4, 0.14), 0.97)
      : hslToHex(primary.hue, Math.min(primary.sat * 0.5, 0.30), 0.09);
  const to =
    mode === 'gradient'
      ? tone === 'light'
        ? hslToHex(secondary.hue, Math.min(secondary.sat * 0.45, 0.16), 0.92)
        : hslToHex(secondary.hue, Math.min(secondary.sat * 0.45, 0.28), 0.17)
      : from;

  const reason =
    cleanReason(vlmReason) ??
    (tone === 'light'
      ? `${dominant.name} carries most of the logo's weight, so a near-white canvas tinted with the ${primary.name || 'brand'} hue keeps every mark high-contrast while quietly echoing its palette${mode === 'gradient' ? ` and easing toward ${secondary?.name || 'a second brand tone'}` : ''}.`
      : `The logo reads light against deep surfaces - a dark ${primary.name || 'brand'}-tinted canvas makes it pop and gives the page a premium, focused mood${mode === 'gradient' ? ` with a ${secondary?.name || 'second tone'} glow rising behind it` : ''}.`);

  return { tone, mode, from, to, reason };
}

/** Parse a persisted JSON background suggestion (tolerates junk). */
export function parseBackgroundSuggestion(raw: string | null | undefined): BackgroundSuggestion | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const tone = v.tone === 'dark' ? 'dark' : v.tone === 'light' ? 'light' : null;
    const mode = v.mode === 'gradient' ? 'gradient' : v.mode === 'solid' ? 'solid' : null;
    const from = typeof v.from === 'string' && HEX_RE.test(v.from) ? v.from : null;
    const to = typeof v.to === 'string' && HEX_RE.test(v.to) ? v.to : from;
    const reason = typeof v.reason === 'string' && v.reason.trim() ? v.reason.trim() : null;
    if (!tone || !mode || !from || !to || !reason) return null;
    return { tone, mode, from, to, reason };
  } catch {
    return null;
  }
}
