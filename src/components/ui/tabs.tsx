import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Tabs as TabsPrimitive } from 'radix-ui'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { cn } from '@/lib/utils'

/**
 * Two tab styles exist in the app:
 * - `pill` (default): the glassy segmented control the phase switcher uses —
 *   the active tab wears a solid white pill that slides between options.
 * - `side`: the settings navigation — a row on phones, a sidebar from `sm`
 *   up, with the active item on an accent wash.
 */
type TabsVariant = 'pill' | 'side'

const TabsValueContext = React.createContext<string | undefined>(undefined)

type ListContext = { variant: TabsVariant; pillId: string }
const TabsListContext = React.createContext<ListContext>({ variant: 'pill', pillId: '' })

/** Snap spring: arrives fast, settles without visible bounce. */
const PILL_SPRING = { type: 'spring', stiffness: 420, damping: 38, mass: 0.8 } as const

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  // Radix keeps the selected value to itself, but the sliding pill has to know
  // which trigger owns it. Mirror the value here for both control modes.
  const [selected, setSelected] = React.useState(value ?? defaultValue)
  const current = value ?? selected

  return (
    <TabsValueContext.Provider value={current}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn('contents', className)}
        value={value}
        defaultValue={defaultValue}
        onValueChange={(next) => {
          setSelected(next)
          onValueChange?.(next)
        }}
        {...props}
      />
    </TabsValueContext.Provider>
  )
}

const tabsListVariants = cva('', {
  variants: {
    variant: {
      pill: 'no-scrollbar relative isolate flex max-w-full gap-1 overflow-x-auto rounded-full border border-white/14 bg-white/12 p-1 backdrop-blur-md',
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
  const pillId = React.useId()
  const ctx = React.useMemo<ListContext>(
    () => ({ variant: variant ?? 'pill', pillId }),
    [variant, pillId],
  )

  return (
    <TabsListContext.Provider value={ctx}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsListContext.Provider>
  )
}

const tabsTriggerVariants = cva('shrink-0 transition outline-none', {
  variants: {
    variant: {
      pill: 'coarse:h-11 relative h-9 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap text-ink-secondary data-[state=active]:font-semibold data-[state=active]:text-ink data-[state=inactive]:hover:bg-white/14 sm:h-10 sm:px-5.5 sm:text-[15px]',
      side: 'coarse:h-11 flex h-9.5 items-center gap-2 rounded-lg px-3.5 text-left text-[13.5px] font-medium text-ink-muted hover:bg-white/6 data-[state=active]:bg-accent-soft data-[state=active]:font-semibold data-[state=active]:text-accent-bright data-[state=active]:hover:bg-accent-soft',
    },
  },
  defaultVariants: { variant: 'pill' },
})

function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const { variant, pillId } = React.useContext(TabsListContext)
  const selected = React.useContext(TabsValueContext)
  const reduceMotion = useReducedMotion()
  const isActive = variant === 'pill' && selected === props.value

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={variant}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    >
      {variant === 'pill' ? (
        <>
          {/* One pill shared across the triggers: Motion cross-fades the
              `layoutId` between them, so it slides instead of reappearing. */}
          <AnimatePresence initial={false}>
            {isActive ? (
              <motion.span
                aria-hidden
                layoutId={pillId}
                // Negative z so the pill stays behind every label while it
                // travels: the trigger must not open a stacking context.
                className="absolute inset-0 -z-10 rounded-full bg-white"
                transition={reduceMotion ? { duration: 0 } : PILL_SPRING}
              />
            ) : null}
          </AnimatePresence>
          {children}
        </>
      ) : (
        children
      )}
    </TabsPrimitive.Trigger>
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
