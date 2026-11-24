'use client'

// ============================================================
// Global appearance preferences for the MrDesign.md UI: color
// mode, accent color, corner radius, and density.
//
// Preferences are stored in localStorage and applied as data
// attributes on <html> (data-mode / data-accent / data-radius /
// data-density). Plain CSS in globals.css reads those attributes
// and restyles EVERY component - all shadcn/ui primitives and the
// wizard chrome share the same CSS variable scales, so one change
// updates the whole UI at once.
//
// layout.tsx ships a tiny inline script that re-applies the stored
// attributes before hydration, so there is no flash of defaults.
// ============================================================

import { useSyncExternalStore } from 'react'

export type ColorMode = 'light' | 'dark'
export type Accent = 'graphite' | 'moss' | 'terracotta' | 'wine' | 'honey'
export type Radius = 'sharp' | 'soft' | 'round'
export type Density = 'comfortable' | 'compact'

export interface Appearance {
  accent: Accent
  radius: Radius
  density: Density
}

const STORAGE_KEY = 'mrdesign-appearance'

export const DEFAULT_APPEARANCE: Appearance = {
  accent: 'graphite',
  radius: 'soft',
  density: 'comfortable',
}

export const ACCENT_OPTIONS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'graphite', label: 'Graphite', swatch: '#383838' },
  { value: 'moss', label: 'Moss', swatch: '#15803d' },
  { value: 'terracotta', label: 'Terracotta', swatch: '#c2410c' },
  { value: 'wine', label: 'Wine', swatch: '#9f1239' },
  { value: 'honey', label: 'Honey', swatch: '#854d0e' },
]

export const RADIUS_OPTIONS: { value: Radius; label: string }[] = [
  { value: 'sharp', label: 'Sharp' },
  { value: 'soft', label: 'Soft' },
  { value: 'round', label: 'Round' },
]

export const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function readStorage(): Appearance {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw) as Partial<Appearance>
    return {
      accent: isOneOf(parsed.accent, ACCENT_OPTIONS.map((a) => a.value))
        ? parsed.accent
        : DEFAULT_APPEARANCE.accent,
      radius: isOneOf(parsed.radius, RADIUS_OPTIONS.map((r) => r.value))
        ? parsed.radius
        : DEFAULT_APPEARANCE.radius,
      density: isOneOf(parsed.density, DENSITY_OPTIONS.map((d) => d.value))
        ? parsed.density
        : DEFAULT_APPEARANCE.density,
    }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** Mirror the preferences onto <html> so the CSS variable overrides kick in. */
function applyToDocument(a: Appearance) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  el.dataset.accent = a.accent
  el.dataset.radius = a.radius
  el.dataset.density = a.density
}

let current: Appearance | null = null
const listeners = new Set<() => void>()

function ensureCurrent(): Appearance {
  if (!current) {
    current = readStorage()
    applyToDocument(current)
  }
  return current
}

/** useSyncExternalStore client snapshot (stable reference between updates). */
export function getAppearance(): Appearance {
  return ensureCurrent()
}

/** useSyncExternalStore server snapshot: always the defaults. */
export function getServerAppearance(): Appearance {
  return DEFAULT_APPEARANCE
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Merge a partial patch, persist it, apply it, and notify subscribers. */
export function setAppearance(patch: Partial<Appearance>): void {
  const next: Appearance = { ...ensureCurrent(), ...patch }
  current = next
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Private mode / storage disabled: the choice still applies for this session.
  }
  applyToDocument(next)
  listeners.forEach((l) => l())
}

export function resetAppearance(): void {
  setAppearance(DEFAULT_APPEARANCE)
}

/** Hydration-safe React binding for the appearance store. */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeAppearance, getAppearance, getServerAppearance)
}
