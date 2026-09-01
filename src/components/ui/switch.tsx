import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/** The app's Toggle look: accent track when on, ink thumb sliding right. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'tap-pad peer relative inline-flex h-6.25 w-10.5 shrink-0 items-center rounded-full transition outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent data-[state=unchecked]:bg-white/14',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-4.75 w-4.75 rounded-full transition-all data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-ink data-[state=unchecked]:translate-x-[3px] data-[state=unchecked]:bg-white"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
