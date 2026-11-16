// ============================================================
// Logo image pipeline + color science helpers (server only).
// Uses sharp to normalize any supported logo format (png/jpeg/
// webp/gif/svg) into a clean RGB PNG for the VLM, and extracts
// a deterministic pixel palette. Also hosts the color utilities
// shared by token normalization and export artifacts.
// ============================================================

import sharp from 'sharp';
import type { PaletteColor } from '@/lib/types';

// ---------- data URL helpers ----------

function decodeDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const trimmed = (dataUrl ?? '').trim();
  const match = /^data:([^;,]+)?(;[^,]*)?,/.exec(trimmed);
  if (!match) {
    throw new Error('Invalid logo data URL: missing "data:...," prefix');
  }
  const mime = match[1] || 'application/octet-stream';
  const base64 = trimmed.slice(match[0].length);
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Invalid logo data URL: decoded payload is empty');
  }
  return { buffer, mime };
}

/** SVG rasterization quality depends on the density sharp uses to render it. */
function sharpOptionsFor(mime: string): { density?: number } {
  return mime === 'image/svg+xml' ? { density: 300 } : {};
}

// ---------- color primitives ----------

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9A-Fa-f]{6})$/.exec((hex ?? '').trim());
  if (!match) return { r: 0, g: 0, b: 0 };
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    [r, g, b]
      .map((v) => clamp(v).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Euclidean distance between two RGB colors (0-441.67). */
export function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/** Linear mix of two hex colors. t=0 → a, t=1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ca.r + (cb.r - ca.r) * k, ca.g + (cb.g - ca.g) * k, ca.b + (cb.b - ca.b) * k);
}

export function lightenHex(hex: string, t: number): string {
  return mixHex(hex, '#FFFFFF', t);
}

export function darkenHex(hex: string, t: number): string {
  return mixHex(hex, '#000000', t);
}

/** WCAG relative luminance (0-1). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1-21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** '#FFFFFF' or '#111827', whichever contrasts better against bgHex. */
export function bestTextColor(bgHex: string): string {
  return contrastRatio(bgHex, '#FFFFFF') >= contrastRatio(bgHex, '#111827') ? '#FFFFFF' : '#111827';
}

// ---------- human color naming ----------

interface Hsl {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

const HUE_TABLE: Array<[number, string]> = [
  [15, 'Red'],
  [40, 'Orange'],
  [50, 'Amber'],
  [60, 'Yellow'],
  [75, 'Lime'],
  [95, 'Green'],
  [165, 'Emerald'],
  [190, 'Teal'],
  [205, 'Cyan'],
  [225, 'Azure'],
  [248, 'Blue'],
  [270, 'Indigo'],
  [290, 'Violet'],
  [310, 'Purple'],
  [330, 'Magenta'],
  [345, 'Pink'],
  [360, 'Rose'],
];

function hueName(h: number): string {
  for (const [max, name] of HUE_TABLE) {
    if (h < max) return name;
  }
  return 'Rose';
}

function lightnessPrefix(l: number): string {
  if (l < 25) return 'Deep';
  if (l < 40) return 'Dark';
  if (l > 82) return 'Pale';
  if (l > 65) return 'Light';
  return '';
}

/** Human-friendly color name from raw RGB values, e.g. "Deep Teal", "Muted Azure". */
export function colorNameFromRgb(r: number, g: number, b: number): string {
  const { h, s, l } = rgbToHsl(r, g, b);
  const parts: string[] = [];
  const lp = lightnessPrefix(l);
  if (lp) parts.push(lp);
  if (s < 12) parts.push('Gray');
  else {
    if (s < 28) parts.push('Muted');
    parts.push(hueName(h));
  }
  return parts.join(' ');
}

export function colorNameFromHex(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return colorNameFromRgb(r, g, b);
}

// ---------- logo normalization for the VLM ----------

/**
 * Decode any supported logo data URL into a normalized, flattened RGB PNG
 * (≤1024px, white background) encoded as base64. Handles SVG/webp/gif
 * conversion so the VLM always receives a clean PNG.
 */
export async function normalizeLogo(dataUrl: string): Promise<{ base64: string }> {
  try {
    const { buffer, mime } = decodeDataUrl(dataUrl);
    const pngBuffer = await sharp(buffer, sharpOptionsFor(mime))
      .flatten({ background: '#ffffff' })
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();
    return { base64: pngBuffer.toString('base64') };
  } catch (err) {
    console.error('normalizeLogo failed:', err);
    throw new Error(`Failed to normalize logo image: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ---------- deterministic pixel palette extraction ----------

interface Bucket {
  count: number;
  rSum: number;
  gSum: number;
  bSum: number;
}

/**
 * Extract dominant colors from the logo pixels. Buckets by 4-bit-per-channel
 * key, keeps the top ~14 buckets, filters near-white/near-black, merges
 * near-identical colors (< 48 RGB distance), caps at 6, sorts by weight desc.
 * Returns [] on any error (palette is non-critical).
 */
export async function extractPixelColors(dataUrl: string): Promise<PaletteColor[]> {
  try {
    const { buffer, mime } = decodeDataUrl(dataUrl);
    const { data, info } = await sharp(buffer, sharpOptionsFor(mime))
      .flatten({ background: '#ffffff' })
      .resize(96, 96, { fit: 'inside' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = Math.max(1, info.channels);
    const total = info.width * info.height;
    if (total <= 0) return [];

    const buckets = new Map<number, Bucket>();
    for (let i = 0; i + channels - 1 < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = buckets.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
      bucket.count += 1;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
      buckets.set(key, bucket);
    }

    const totalPixels = [...buckets.values()].reduce((acc, b) => acc + b.count, 0) || 1;

    // Top ~14 buckets by count → average hex + weight.
    const top = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 14);
    let colors: Array<PaletteColor & { count: number }> = top.map((bucket) => {
      const r = Math.round(bucket.rSum / bucket.count);
      const g = Math.round(bucket.gSum / bucket.count);
      const b = Math.round(bucket.bSum / bucket.count);
      return {
        hex: rgbToHex(r, g, b),
        name: colorNameFromRgb(r, g, b),
        weight: (bucket.count / totalPixels) * 100,
        count: bucket.count,
      };
    });

    // Filter near-white (min channel > 240) and near-black (max channel < 25)
    // unless fewer than 3 colors would remain.
    const filtered = colors.filter((c) => {
      const { r, g, b } = hexToRgb(c.hex);
      const min = Math.min(r, g, b);
      const max = Math.max(r, g, b);
      return !(min > 240 || max < 25);
    });
    if (filtered.length >= 3) colors = filtered;

    // Greedy merge of near-identical colors (distance < 48): keep the higher
    // weight entry, average the hex weighted by pixel counts.
    const merged: Array<PaletteColor & { count: number; rSum: number; gSum: number; bSum: number }> = [];
    for (const color of colors) {
      const { r, g, b } = hexToRgb(color.hex);
      const target = merged.find((m) => rgbDistance(hexToRgb(m.hex), { r, g, b }) < 48);
      if (target) {
        target.count += color.count;
        target.rSum += r * color.count;
        target.gSum += g * color.count;
        target.bSum += b * color.count;
        target.weight += color.weight;
        const nr = Math.round(target.rSum / target.count);
        const ng = Math.round(target.gSum / target.count);
        const nb = Math.round(target.bSum / target.count);
        target.hex = rgbToHex(nr, ng, nb);
        target.name = colorNameFromRgb(nr, ng, nb);
      } else {
        merged.push({ ...color, rSum: r * color.count, gSum: g * color.count, bSum: b * color.count });
      }
    }

    return merged
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((c) => ({
        hex: c.hex,
        name: c.name,
        weight: Math.round(Math.max(0, Math.min(100, c.weight)) * 10) / 10,
      }));
  } catch (err) {
    console.error('extractPixelColors failed:', err);
    return [];
  }
}
