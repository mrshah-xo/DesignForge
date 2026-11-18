'use client'

import { Wand2 } from 'lucide-react'

interface LogoThumbProps {
  src?: string | null
  name?: string
  size?: number
  className?: string
}

/**
 * Tiny logo thumbnail. Data URLs must use plain <img> (not next/image).
 * Falls back to a brand-initial square when no logo exists yet.
 */
export function LogoThumb({ src, name, size = 24, className = '' }: LogoThumbProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ? `${name} logo` : 'Project logo'}
        width={size}
        height={size}
        className={`shrink-0 rounded-md border border-border bg-card object-contain dark:border-gray-700 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground ${className}`}
      style={{ width: size, height: size }}
    >
      <Wand2 style={{ width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}
