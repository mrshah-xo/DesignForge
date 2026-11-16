'use client'

import {
  BookOpenCheck,
  GitCompareArrows,
  PackageCheck,
  Palette,
  ScanSearch,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react'

/** Map of STEPS icon keys -> lucide components. */
export const STEP_ICONS: Record<string, LucideIcon> = {
  Upload,
  ScanSearch,
  Users,
  BookOpenCheck,
  GitCompareArrows,
  Palette,
  PackageCheck,
}

interface StepIconProps {
  icon: string
  className?: string
}

export function StepIcon({ icon, className }: StepIconProps) {
  const Icon = STEP_ICONS[icon] ?? Palette
  return <Icon className={className} aria-hidden="true" />
}
