'use client'

import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Drawer } from '@heroui/react'

import { cn } from '@/lib/utils'

const SheetOpenContext = React.createContext<{ open: boolean; onOpenChange: (open: boolean) => void } | null>(null)

function Sheet({ open = false, onOpenChange = () => {}, children }: { open?: boolean; onOpenChange?: (open: boolean) => void; children?: React.ReactNode }) {
  return (
    <SheetOpenContext.Provider value={{ open, onOpenChange }}>
      <Drawer>{children}</Drawer>
    </SheetOpenContext.Provider>
  )
}

function SheetTrigger({ children, asChild: _asChild, ...props }: { children?: React.ReactNode; asChild?: boolean } & React.ComponentProps<'button'>) {
  const ctx = React.useContext(SheetOpenContext)
  // Slot merges the open handler onto the single child's own DOM node (our Button), instead of
  // wrapping it in a second <button> the way Drawer.Trigger's asChild does — that nested-button
  // shape triggers a hydration mismatch.
  return (
    <Slot onClick={() => ctx?.onOpenChange(true)} {...props}>
      {children}
    </Slot>
  )
}

function SheetClose({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <Drawer.CloseTrigger className={className}>{children}</Drawer.CloseTrigger>
}

const PLACEMENT: Record<'top' | 'right' | 'bottom' | 'left', 'top' | 'right' | 'bottom' | 'left'> = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
}

function SheetContent({
  className,
  children,
  side = 'right',
}: {
  className?: string
  children?: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}) {
  const ctx = React.useContext(SheetOpenContext)
  return (
    <Drawer.Backdrop isOpen={ctx?.open} onOpenChange={ctx?.onOpenChange}>
      <Drawer.Content placement={PLACEMENT[side]} className={side === 'left' || side === 'right' ? 'w-3/4 sm:max-w-sm' : undefined}>
        <Drawer.Dialog className={cn('flex flex-col gap-4', className)}>
          {children}
          <Drawer.CloseTrigger className="absolute top-4 right-4" />
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
  )
}

function SheetHeader({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <Drawer.Header data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)}>
      {children}
    </Drawer.Header>
  )
}

function SheetFooter({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <Drawer.Footer data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)}>
      {children}
    </Drawer.Footer>
  )
}

function SheetTitle({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <Drawer.Heading data-slot="sheet-title" className={cn('text-foreground font-semibold', className)}>
      {children}
    </Drawer.Heading>
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="sheet-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
