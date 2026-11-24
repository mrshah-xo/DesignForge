'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

type VenomButtonProps = ComponentProps<typeof Button>

/**
 * The signature MrDesign.md CTA - a matte near-black pill wrapped in a
 * slow warm-gradient aura (orange-dominant rainbow), matching the brand
 * reference. Reserved for the single primary action of a view: the
 * landing "Start Designing" button and the primary actions inside the
 * "Want a prompt?" dialogs. Everything else stays a plain Button.
 *
 * The wrapper owns the aura layers (`df-rgb-glow` ::before halo +
 * ::after hairline). `data-disabled` lets the CSS calm the whole unit -
 * halo, hairline and pill together - when the action is unavailable,
 * instead of dimming the pill alone under a still-vivid ring. The moment
 * the action goes live (e.g. the user pasted the agent reply), the aura
 * lights up around the pill.
 */
export function VenomButton({ className, disabled, children, ...props }: VenomButtonProps) {
  return (
    <div
      className="df-rgb-glow w-full rounded-full"
      data-disabled={disabled ? 'true' : undefined}
    >
      <Button
        disabled={disabled}
        className={cn(
          'df-btn-venom h-10 w-full rounded-full text-sm font-bold',
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    </div>
  )
}
