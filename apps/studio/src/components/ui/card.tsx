import * as React from 'react'
import { Card as HeroCard } from '@heroui/react'

import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<typeof HeroCard>) {
  return <HeroCard data-slot="card" variant="transparent" className={cn('gap-6 py-6', className)} {...props} />
}

function CardHeader({ className, ...props }: React.ComponentProps<typeof HeroCard.Header>) {
  return (
    <HeroCard.Header
      data-slot="card-header"
      className={cn(
        '@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<typeof HeroCard.Title>) {
  return <HeroCard.Title data-slot="card-title" className={cn('leading-none font-semibold', className)} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<typeof HeroCard.Description>) {
  return <HeroCard.Description data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<typeof HeroCard.Content>) {
  return <HeroCard.Content data-slot="card-content" className={cn('px-6', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<typeof HeroCard.Footer>) {
  return <HeroCard.Footer data-slot="card-footer" className={cn('flex items-center px-6 [.border-t]:pt-6', className)} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
