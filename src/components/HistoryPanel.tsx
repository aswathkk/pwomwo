import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bar, BarChart, XAxis } from 'recharts'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import {
  computeStats,
  type Bar as BarDatum,
  type BucketMinutes,
  type HeatCell,
  type Stats,
} from '../history/stats'
import { buildExport, download, ImportError, parseImport, toCsv } from '../history/io'
import { confirmDialog } from '../ui/dialog-store'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cls, Section, Icons } from './primitives'

const BUCKETS: { value: BucketMinutes; label: string }[] = [
  { value: 15, label: '15 MIN' },
  { value: 30, label: '30 MIN' },
  { value: 60, label: '1 HR' },
  { value: 120, label: '2 HR' },
]

const CELL = 13 // heatmap column pitch: 11px cell + 2px gap

const chartConfig = {
  count: { label: 'Sessions', color: 'var(--color-accent)' },
} satisfies ChartConfig

export function HistoryPanel({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void
  onOpenSettings: (tab: string) => void
}) {
  const state = useAppState()
  const fileInput = useRef<HTMLInputElement>(null)
  const [bucket, setBucket] = useState<BucketMinutes>(30)
  const [heatMonths, setHeatMonths] = useState<9 | 12>(9)
  const [showTable, setShowTable] = useState(false)

  const records = useMemo(
    () => store.repo.all(),
    // `historyVersion` changes whenever a session lands, locally or over sync.
    [state.historyVersion],
  )

  const stats = useMemo(
    () =>
      computeStats(records, {
        weekStart: state.settings.weekStart,
        bucket,
        heatMonths,
      }),
    [records, state.settings.weekStart, bucket, heatMonths],
  )

  const empty = stats.total === 0

  const onSaveCsv = () => {
    download('history.csv', toCsv(records), 'text/csv;charset=utf-8')
    store.notify('history.csv saved')
  }

  const onExport = () => {
    download(
      'pwomwo_history.json',
      JSON.stringify(
        buildExport(records, {
          id: store.identity?.deviceId ?? 'local',
          name: store.settings.deviceName,
        }),
      ),
      'application/json',
    )
    store.notify('History exported')
  }

  const onImportFile = async (file: File) => {
    const { confirmed } = await confirmDialog({
      title: 'Import history?',
      body: 'Imported history will be merged with your existing history. Continue?',
      confirmLabel: 'Import & merge',
    })
    if (!confirmed) return
    try {
      const parsed = await parseImport(await file.text(), file.name)
      const { added, skipped } = await store.importRecords(parsed)
      store.notify(
        `${added.toLocaleString()} pomodoros imported${
          skipped ? ` (${skipped.toLocaleString()} duplicates skipped)` : ''
        }`,
        'good',
      )
    } catch (err) {
      store.notify(
        err instanceof ImportError ? `Import failed: ${err.message}` : 'Import failed. The file could not be read.',
        'bad',
      )
    }
  }

  const onClear = async () => {
    const { confirmed, checked } = await confirmDialog({
      title: 'Permanently delete all history on this device?',
      body: state.peers.length
        ? 'Without the box ticked, your other devices keep their copy and a later sync will restore these records here.'
        : 'This cannot be undone. Export first if you want a backup.',
      checkbox: state.peers.length ? 'Also clear on connected devices' : undefined,
      confirmLabel: 'Clear history',
      danger: true,
    })
    if (!confirmed) return
    const removed = await store.clearHistory(checked)
    store.notify(`${removed.toLocaleString()} sessions deleted`, 'warn')
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        aria-describedby={undefined}
        className="scroll-region gap-6 overflow-y-auto px-4.5 pt-[calc(1.5rem+var(--safe-t))] pb-[calc(1.5rem+var(--safe-b))] sm:gap-7.5 sm:px-9.5 sm:pt-8"
      >
        <SheetHeader>
          <SheetTitle>History</SheetTitle>
          <SheetClose asChild>
            <Button variant="soft" size="icon" aria-label="Close history">
              {Icons.close}
            </Button>
          </SheetClose>
        </SheetHeader>

        <StatBlocks stats={stats} empty={empty} />

        <Section
          title="Daily Distribution"
          extra={
            <div className="flex gap-1">
              {BUCKETS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={bucket === b.value}
                  onClick={() => setBucket(b.value)}
                  className={`tap-pad h-6 rounded-lg px-2.5 text-[10.5px] tracking-[0.06em] transition ${
                    bucket === b.value
                      ? 'bg-accent-soft font-semibold text-accent'
                      : 'font-medium text-ink-muted hover:text-white'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          }
        >
          {empty ? (
            <EmptyState>Finish a focus session to see your daily stats</EmptyState>
          ) : (
            <Distribution
              bars={stats.daily}
              gradientId="daily-fill"
              height="h-28"
              // Every third hour, whatever the bucket, and the tick gap thins
              // those further on a narrow phone rather than letting them collide.
              ticks={stats.daily.filter((_, i) => (i * bucket) % 180 === 0).map((b) => b.label)}
              minTickGap={30}
            />
          )}
        </Section>

        <Section title="Weekly Distribution">
          {empty ? (
            <EmptyState>Finish a focus session to see your weekly stats</EmptyState>
          ) : (
            <Distribution bars={stats.weekly} gradientId="weekly-fill" height="h-24" barGap={10} />
          )}
        </Section>

        <Section
          title={empty ? 'Your last 9 months' : stats.heatTitle}
          extra={
            !empty ? (
              <button
                type="button"
                className="tap-pad text-[10.5px] font-medium tracking-[0.06em] text-ink-muted transition hover:text-white"
                onClick={() => setHeatMonths((m) => (m === 9 ? 12 : 9))}
              >
                {heatMonths === 9 ? 'SHOW 12 MONTHS' : 'SHOW 9 MONTHS'}
              </button>
            ) : null
          }
        >
          {empty ? (
            <EmptyState>Finish a focus session to see your history</EmptyState>
          ) : (
            <Heatmap stats={stats} />
          )}
        </Section>

        {!empty ? (
          <div>
            <button
              type="button"
              className="tap-pad text-[11px] font-medium text-ink-muted underline underline-offset-2 transition hover:text-white"
              aria-expanded={showTable}
              onClick={() => setShowTable((v) => !v)}
            >
              {showTable ? 'Hide' : 'Show'} the charts as a table
            </button>
            {showTable ? <DataTable stats={stats} /> : null}
          </div>
        ) : null}

        <div className="mt-auto">
          <h3 className={`${cls.sectionTitle} mb-3`}>Your History</h3>
          <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-x-4.5">
            <Action
              label="Save as CSV"
              hint="Excel, Sheets. Marinara columns."
              disabled={empty}
              onClick={onSaveCsv}
            />
            <Action
              label="Export"
              hint="Backup, or import elsewhere"
              disabled={empty}
              onClick={onExport}
            />
            <Action
              label="Import"
              hint="Merges; accepts Marinara files"
              onClick={() => fileInput.current?.click()}
            />
            <Action
              label="Clear History"
              hint="Deletes permanently. Asks first."
              danger
              disabled={empty}
              onClick={() => void onClear()}
            />
          </div>

          <input
            ref={fileInput}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onImportFile(file)
            }}
          />

          {empty ? (
            <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
              Coming from Marinara? Import your <span className="font-mono">history.json</span> and every
              stat carries over.{' '}
              <button
                type="button"
                className="underline underline-offset-2 transition hover:text-white"
                onClick={() => onOpenSettings('data')}
              >
                More data options
              </button>
              .
            </p>
          ) : (
            <p className="mt-4 text-[10.5px] leading-relaxed text-ink-muted">
              Tracking since{' '}
              {stats.firstRecordAt
                ? new Date(stats.firstRecordAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'your first session'}
              . {stats.total.toLocaleString()} sessions, stored on this device only
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Both distributions are the same chart at different densities: 96 slim bars
 * across a day, or seven wide ones across a week. shadcn's ChartTooltip
 * replaces the browser `title` tooltips these bars used to carry.
 */
function Distribution({
  bars,
  gradientId,
  height,
  ticks,
  minTickGap = 0,
  barGap,
}: {
  bars: BarDatum[]
  gradientId: string
  height: string
  ticks?: string[]
  minTickGap?: number
  barGap?: number
}) {
  return (
    <ChartContainer
      config={chartConfig}
      className={`aspect-auto w-full [&_.recharts-cartesian-axis-tick_text]:text-[10.5px] ${height}`}
    >
      <BarChart
        accessibilityLayer
        data={bars}
        barCategoryGap={barGap}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent-bright)" />
            <stop offset="100%" stopColor="var(--color-accent-deep)" />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tickLine={false}
          tickMargin={6}
          ticks={ticks}
          interval="preserveStartEnd"
          minTickGap={minTickGap}
          axisLine={{ stroke: 'rgb(255 255 255 / 0.12)' }}
        />
        <ChartTooltip
          cursor={{ fill: 'rgb(255 255 255 / 0.06)' }}
          content={
            <ChartTooltipContent
              indicator="dot"
              color="var(--color-count)"
              labelFormatter={(_label, payload) =>
                (payload[0]?.payload as BarDatum | undefined)?.range
              }
            />
          }
        />
        <Bar
          dataKey="count"
          fill={`url(#${gradientId})`}
          radius={[3, 3, 0, 0]}
          // Recharts grows bars in JS, outside the reduced-motion rules in
          // index.css, and these bars never animated in before.
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  )
}

function StatBlocks({ stats, empty }: { stats: Stats; empty: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-3.5">
      {stats.blocks.map((block) => (
        <div
          key={block.label}
          className="rounded-xl border border-white/7 bg-white/5 px-3.5 py-4"
        >
          <div className={`text-[34px] leading-none font-bold tabular ${empty ? 'text-accent/40' : 'text-accent'}`}>
            {block.n.toLocaleString()}
          </div>
          <div className="mt-1.75 text-[12px] font-medium text-ink-secondary">{block.label}</div>
          {!empty && block.avg ? (
            <div className="mt-0.5 text-[11px] text-ink-muted">{block.avg}</div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function Heatmap({ stats }: { stats: Stats }) {
  const columns = stats.heatCells.length / 7
  const scroller = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ cell: HeatCell; x: number; y: number } | null>(null)

  // Today sits at the right end. This used to be a `direction: rtl` wrapper,
  // but the dialog's scroll lock reads `scrollLeft` to decide whether an inner
  // element can scroll, and under RTL that is 0 at the right edge — so every
  // wheel and swipe over the map was swallowed. Anchoring by hand keeps the
  // container in plain LTR, where the lock agrees there is room to move.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [stats.heatCells.length])

  const onCellOver = (event: React.MouseEvent<HTMLDivElement>) => {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]')
    // The 2px gaps between cells are part of the grid, not of any day. Holding
    // the last cell there stops the card flickering as the pointer travels.
    if (!el) return
    const cell = stats.heatCells[Number(el.dataset['cell'])]
    if (!cell?.date) return setTip(null)
    const rect = el.getBoundingClientRect()
    setTip({ cell, x: rect.left + rect.width / 2, y: rect.top })
  }

  return (
    <div>
      <div ref={scroller} data-scroll-x className="touch-pan-x overflow-x-auto overscroll-x-contain">
        <div className="relative inline-block pt-4" style={{ minWidth: columns * CELL }}>
          {stats.monthLabels.map((m) => (
            <span
              key={`${m.txt}-${m.col}`}
              className="absolute top-0 text-[10px] text-ink-muted"
              style={{ left: m.col * CELL }}
            >
              {m.txt}
            </span>
          ))}
          <div
            className="grid grid-flow-col grid-rows-7 gap-0.5 [grid-auto-columns:11px]"
            onMouseOver={onCellOver}
            onMouseLeave={() => setTip(null)}
          >
            {stats.heatCells.map((cell, i) => (
              <div
                key={i}
                data-cell={i}
                data-level={cell.level}
                className={`h-2.75 w-2.75 rounded-[2.5px] ${
                  cell.date === null
                    ? 'bg-transparent'
                    : cell.level === 0
                      ? 'bg-white/7'
                      : cell.level === 1
                        ? 'bg-heat-1'
                        : cell.level === 2
                          ? 'bg-heat-2'
                          : cell.level === 3
                            ? 'bg-heat-3'
                            : 'bg-heat-4'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
      {tip ? <CellTooltip label={tip.cell.label} count={tip.cell.count} x={tip.x} y={tip.y} /> : null}
      <div className="mt-3 flex items-center gap-1 text-[10.5px] text-ink-muted">
        <span className="mr-1">less</span>
        {['bg-white/7', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'].map(
          (c) => (
            <span key={c} aria-hidden className={`h-2.75 w-2.75 rounded-[2.5px] ${c}`} />
          ),
        )}
        <span className="ml-1">more</span>
      </div>
    </div>
  )
}

/**
 * The heatmap is not a recharts chart, so it cannot use ChartTooltipContent.
 * This is that component's card, positioned against a cell instead of a
 * series. It goes to the body because the sheet's backdrop filter makes the
 * panel a containing block, which would anchor a `fixed` card to the panel and
 * let the scroll container clip it.
 */
function CellTooltip({ label, count, x, y }: { label: string; count: number; x: number; y: number }) {
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-100 grid min-w-32 -translate-x-1/2 -translate-y-full items-start gap-1.5 rounded-lg border border-white/10 bg-raised px-2.5 py-1.5 text-xs shadow-xl"
      // Kept clear of the viewport edges, where half the card would sit offscreen.
      style={{ left: Math.min(Math.max(x, 72), window.innerWidth - 72), top: y - 8 }}
    >
      <div className="font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[2px] bg-accent" />
        <div className="flex flex-1 items-center justify-between gap-4 leading-none">
          <span className="text-ink-muted">Sessions</span>
          <span className="tabular font-mono font-medium text-foreground">
            {count.toLocaleString()}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Charts need a text alternative to pass WCAG 2.2 AA (PRD accessibility). */
function DataTable({ stats }: { stats: Stats }) {
  return (
    <table className="mt-2.5 w-full border-collapse text-[11.5px] text-ink-muted">
      <caption className="sr-only">Completed focus sessions by weekday</caption>
      <thead>
        <tr>
          <th scope="col" className="border-b border-white/8 py-1 pr-2 text-left font-medium">
            Day
          </th>
          <th scope="col" className="border-b border-white/8 py-1 pr-2 text-left font-medium">
            Sessions
          </th>
        </tr>
      </thead>
      <tbody>
        {stats.weekly.map((bar) => (
          <tr key={bar.label}>
            <td className="border-b border-white/8 py-1 pr-2">{bar.label}</td>
            <td className="border-b border-white/8 py-1 pr-2 tabular">{bar.count.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-xl border-[1.5px] border-dashed border-white/14 px-8 text-center text-[12.5px] text-ink-muted">
      {children}
    </div>
  )
}

function Action({
  label,
  hint,
  onClick,
  danger,
  disabled,
}: {
  label: string
  hint: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        variant={danger ? 'destructive' : 'outline'}
        size="sm"
        disabled={disabled}
        onClick={onClick}
      >
        {label}
      </Button>
      <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
    </div>
  )
}
