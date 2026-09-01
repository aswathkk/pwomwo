import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'coarse:h-11 h-9 w-full min-w-0 rounded-lg border border-white/12 bg-white/6 px-3 text-[13px] font-medium text-white transition outline-none placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
