'use client'

import * as React from 'react'
import { Separator as HeroSeparator } from '@heroui/react'

import { cn } from '@/lib/utils'

function Separator({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof HeroSeparator>) {
  return <HeroSeparator data-slot="separator" orientation={orientation} className={cn(className)} {...props} />
}

export { Separator }
