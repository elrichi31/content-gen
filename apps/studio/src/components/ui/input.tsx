import * as React from 'react'
import { Input as HeroInput } from '@heroui/react'

import { cn } from '@/lib/utils'

function Input({ className, ...props }: React.ComponentProps<typeof HeroInput>) {
  return <HeroInput data-slot="input" variant="secondary" fullWidth className={cn('text-sm', className)} {...props} />
}

export { Input }
