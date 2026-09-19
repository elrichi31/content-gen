'use client'

import * as React from 'react'
import { Tabs as HeroTabs } from '@heroui/react'

import { cn } from '@/lib/utils'

type TabsProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children?: React.ReactNode
}

function Tabs({ value, defaultValue, onValueChange, className, children, ...props }: TabsProps) {
  return (
    <HeroTabs
      data-slot="tabs"
      selectedKey={value}
      defaultSelectedKey={defaultValue}
      onSelectionChange={onValueChange ? (key) => onValueChange(String(key)) : undefined}
      className={cn('flex flex-col gap-2', className)}
      {...props}
    >
      {children}
    </HeroTabs>
  )
}

function TabsList({ className, children, ...props }: React.ComponentProps<typeof HeroTabs.List>) {
  return (
    <HeroTabs.ListContainer>
      <HeroTabs.List data-slot="tabs-list" aria-label="Tabs" className={cn(className)} {...props}>
        {children}
      </HeroTabs.List>
    </HeroTabs.ListContainer>
  )
}

function TabsTrigger({ value, className, children, ...props }: { value: string; className?: string; children?: React.ReactNode }) {
  return (
    <HeroTabs.Tab data-slot="tabs-trigger" id={value} className={cn(className)} {...props}>
      {children}
    </HeroTabs.Tab>
  )
}

function TabsContent({ value, className, children, ...props }: { value: string; className?: string; children?: React.ReactNode }) {
  return (
    <HeroTabs.Panel data-slot="tabs-content" id={value} className={cn('flex-1 outline-none', className)} {...props}>
      {children}
    </HeroTabs.Panel>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
