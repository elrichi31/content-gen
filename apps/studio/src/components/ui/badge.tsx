import * as React from 'react'
import { Chip } from '@heroui/react'

import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline'

const COLOR_MAP: Record<BadgeVariant, 'accent' | 'default' | 'danger'> = {
  default: 'accent',
  secondary: 'default',
  destructive: 'danger',
  outline: 'default',
}

const CHIP_VARIANT_MAP: Record<BadgeVariant, 'soft' | 'secondary' | 'tertiary'> = {
  default: 'soft',
  secondary: 'secondary',
  destructive: 'soft',
  outline: 'tertiary',
}

function Badge({
  className,
  variant = 'default',
  title,
  ...props
}: Omit<React.ComponentProps<typeof Chip>, 'variant' | 'color'> & { variant?: BadgeVariant; title?: string }) {
  return (
    <span title={title}>
      <Chip data-slot="badge" color={COLOR_MAP[variant]} variant={CHIP_VARIANT_MAP[variant]} size="sm" className={cn('font-medium', className)} {...props} />
    </span>
  )
}

export { Badge }
