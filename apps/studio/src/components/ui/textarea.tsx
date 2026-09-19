import * as React from 'react'
import { TextArea as HeroTextArea } from '@heroui/react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<typeof HeroTextArea>) {
  return <HeroTextArea data-slot="textarea" variant="secondary" fullWidth className={cn('text-sm', className)} {...props} />
}

export { Textarea }
