import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { Button as HeroButton } from '@heroui/react'

import { cn } from '@/lib/utils'

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg'

const VARIANT_MAP: Record<ButtonVariant, 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'> = {
  default: 'primary',
  destructive: 'danger',
  outline: 'outline',
  secondary: 'secondary',
  ghost: 'ghost',
  link: 'ghost',
}

const SIZE_MAP: Record<ButtonSize, 'sm' | 'md' | 'lg'> = {
  default: 'md',
  sm: 'sm',
  lg: 'lg',
  icon: 'md',
  'icon-sm': 'sm',
  'icon-lg': 'lg',
}

const ICON_SIZES: ButtonSize[] = ['icon', 'icon-sm', 'icon-lg']

type ButtonProps = React.ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}

function Button({ className, variant = 'default', size = 'default', asChild = false, disabled, onClick, children, type, value, ...props }: ButtonProps) {
  const isLink = variant === 'link'
  const classes = cn(isLink && 'text-primary underline-offset-4 hover:underline px-0 h-auto', className)

  if (asChild) {
    // Slot merges our HeroUI classes onto the single child (e.g. a next/link Link),
    // since HeroUI's <Button> renders its own element and can't wrap an arbitrary host tag.
    return (
      <Slot
        data-slot="button"
        className={cn('button', `button--${VARIANT_MAP[variant]}`, `button--${SIZE_MAP[size]}`, classes)}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <HeroButton
      data-slot="button"
      variant={VARIANT_MAP[variant]}
      size={SIZE_MAP[size]}
      isIconOnly={ICON_SIZES.includes(size)}
      isDisabled={disabled}
      className={classes}
      onPress={onClick ? (e) => onClick(e as unknown as React.MouseEvent<HTMLButtonElement>) : undefined}
      type={type as 'button' | 'submit' | 'reset' | undefined}
      {...(props as React.ComponentProps<typeof HeroButton>)}
    >
      {children}
    </HeroButton>
  )
}

export { Button }
