import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * The app's button language, expressed as shadcn variants. Focus rings come
 * from the global `:focus-visible` rule in index.css, so no ring classes here.
 *
 * - default    → the white pill (`cls.buttonPrimary`)
 * - secondary  → the translucent pill (`cls.button`)
 * - outline    → the outline pill (`cls.outlinePill`)
 * - destructive→ the danger outline pill (`cls.buttonDanger`/`outlinePillDanger`)
 * - ghost      → the bordered transparent circle (`cls.ghostButton`)
 * - glass      → the blurred toolbar circle (`cls.iconButton`)
 * - soft       → the square close/utility button (`cls.closeButton`)
 */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap transition outline-none disabled:cursor-not-allowed disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-white font-semibold text-ink hover:bg-accent-wash',
        secondary: 'bg-white/9 font-medium text-ink-secondary hover:bg-white/16',
        outline: 'border-[1.5px] border-white/30 font-medium text-white hover:bg-white/10',
        destructive: 'border-[1.5px] border-bad/60 font-medium text-bad hover:bg-bad/12',
        ghost: 'border-[1.5px] border-white/35 bg-transparent text-white hover:bg-white/15',
        glass: 'border-[1.5px] border-white/35 bg-white/8 text-white backdrop-blur-sm hover:bg-white/18',
        soft: 'rounded-lg bg-white/8 text-ink-tertiary hover:bg-white/16',
        link: 'text-accent underline-offset-2 hover:underline',
      },
      size: {
        default: 'h-9.5 coarse:h-11 px-5 text-[13px]',
        sm: 'h-8.5 coarse:h-11 px-4 text-[12.5px]',
        xl: 'h-14 min-w-30 px-6 text-[17px] sm:min-w-35 sm:px-8',
        icon: 'h-8.5 w-8.5 coarse:h-11 coarse:w-11',
        'icon-lg': 'h-10 w-10 coarse:h-11 coarse:w-11',
        'icon-xl': 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
