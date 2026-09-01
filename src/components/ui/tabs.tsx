import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

/**
 * Two tab styles exist in the app:
 * - `pill` (default): the glassy segmented control the phase switcher uses —
 *   an active tab is a solid white pill.
 * - `side`: the settings navigation — a row on phones, a sidebar from `sm`
 *   up, with the active item on an accent wash.
 */
type TabsVariant = 'pill' | 'side'

const TabsVariantContext = React.createContext<TabsVariant>('pill')

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('contents', className)} {...props} />
}

const tabsListVariants = cva('', {
  variants: {
    variant: {
      pill: 'no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/14 bg-white/12 p-1 backdrop-blur-md',
      side: 'no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto sm:w-42 sm:flex-col sm:gap-1',
    },
  },
  defaultVariants: { variant: 'pill' },
})

function TabsList({
  className,
  variant = 'pill',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsVariantContext.Provider value={variant ?? 'pill'}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  )
}

const tabsTriggerVariants = cva('shrink-0 transition outline-none', {
  variants: {
    variant: {
      pill: 'coarse:h-11 h-9 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink-secondary hover:bg-white/14 data-[state=active]:bg-white data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=active]:hover:bg-white sm:h-10 sm:px-5.5 sm:text-[15px]',
      side: 'coarse:h-11 flex h-9.5 items-center gap-2 rounded-lg px-3.5 text-left text-[13.5px] font-medium text-ink-muted hover:bg-white/6 data-[state=active]:bg-accent-soft data-[state=active]:font-semibold data-[state=active]:text-accent-bright data-[state=active]:hover:bg-accent-soft',
    },
  },
  defaultVariants: { variant: 'pill' },
})

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext)
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
