'use client'

import * as React from 'react'
import { Tooltip as HeroTooltip } from '@heroui/react'

import { cn } from '@/lib/utils'

function TooltipProvider({ children }: { children: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

function Tooltip({ children, ...props }: React.ComponentProps<typeof HeroTooltip>) {
  return <HeroTooltip {...props}>{children}</HeroTooltip>
}

function TooltipTrigger({ children, ...props }: React.ComponentProps<typeof HeroTooltip.Trigger>) {
  return <HeroTooltip.Trigger {...props}>{children}</HeroTooltip.Trigger>
}

function TooltipContent({ className, children, showArrow = true, ...props }: React.ComponentProps<typeof HeroTooltip.Content>) {
  return (
    <HeroTooltip.Content data-slot="tooltip-content" showArrow={showArrow} className={cn('text-xs', className)} {...props}>
      {showArrow ? <HeroTooltip.Arrow /> : null}
      {children}
    </HeroTooltip.Content>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
