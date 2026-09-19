'use client'

import * as React from 'react'
import { Select as HeroSelect, ListBox } from '@heroui/react'

import { cn } from '@/lib/utils'

type SelectProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  children?: React.ReactNode
}

function Select({ value, defaultValue, onValueChange, disabled, children }: SelectProps) {
  return (
    <HeroSelect
      data-slot="select"
      value={value}
      defaultValue={defaultValue}
      isDisabled={disabled}
      onChange={onValueChange ? (key) => onValueChange(key == null ? '' : String(key)) : undefined}
    >
      {children}
    </HeroSelect>
  )
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof HeroSelect.Trigger> & { size?: 'sm' | 'default' }) {
  return (
    <HeroSelect.Trigger data-slot="select-trigger" data-size={size} className={cn('w-full', className)} {...props}>
      {children}
    </HeroSelect.Trigger>
  )
}

function SelectValue({ placeholder, className }: { placeholder?: string; className?: string }) {
  return (
    <HeroSelect.Value data-slot="select-value" className={className}>
      {({ isPlaceholder, defaultChildren }) => (isPlaceholder && placeholder ? placeholder : defaultChildren)}
    </HeroSelect.Value>
  )
}

function SelectContent({ className, children, ...props }: React.ComponentProps<typeof HeroSelect.Popover>) {
  return (
    <HeroSelect.Popover data-slot="select-content" className={cn(className)} {...props}>
      <ListBox>{children}</ListBox>
    </HeroSelect.Popover>
  )
}

function SelectItem({ value, className, children, ...props }: { value: string; className?: string; children?: React.ReactNode }) {
  return (
    <ListBox.Item data-slot="select-item" id={value} textValue={typeof children === 'string' ? children : value} className={cn(className)} {...props}>
      {children}
    </ListBox.Item>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
