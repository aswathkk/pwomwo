import { useMemo, useRef, useState } from 'react'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { useOverlay } from '../hooks/useOverlay'
import { computeStats, type BucketMinutes, type Stats } from '../history/stats'
import { buildExport, download, ImportError, parseImport, toCsv } from '../history/io'
import { confirmDialog } from '../ui/dialog-store'
import { cls, Section, Icons } from './primitives'

const BUCKETS: { value: BucketMinutes; label: string }[] = [
  { value: 15, label: '15 MIN' },
  { value: 30, label: '30 MIN' },
  { value: 60, label: '1 HR' },
  { value: 120, label: '2 HR' },
]

const CELL = 13 // heatmap column pitch: 11px cell + 2px gap

export function HistoryPanel({
  onClose,
  onOpenSettings,
}: {
  onClose: () => void
  onOpenSettings: (tab: string) => void
}) {
  const state = useAppState()
  const ref = useOverlay<HTMLElement>(onClose)
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
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="History and statistics"
        className="scroll-region absolute inset-y-0 right-0 flex w-full flex-col gap-6 overflow-y-auto border-l border-white/9 bg-panel-glass px-4.5 pt-[calc(1.5rem+var(--safe-t))] pb-[calc(1.5rem+var(--safe-b))] backdrop-blur-3xl sm:w-160 sm:gap-7.5 sm:px-9.5 sm:pt-8"
      >
        <header className="flex items-center justify-between">
          <h2 className="text-[20px] font-semibold">History</h2>
          <button
            type="button"
            className={cls.closeButton}
            aria-label="Close history"
            onClick={onClose}
          >
            {Icons.close}
          </button>
        </header>

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
            <>
              <div className="flex h-28 items-end gap-0.5 border-b border-white/12 pb-px">
                {stats.daily.map((bar, i) => (
                  <div
                    key={i}
                    title={bar.tip}
                    style={{ height: `${bar.h}%` }}
                    className="min-w-0 flex-1 rounded-t-[2px] bg-linear-180 from-accent-bright to-accent-deep transition hover:brightness-125"
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between text-[10px] text-ink-muted">
                {stats.hourLabels.map((label, i) => (
                  // Eight ticks collide at 375px, so show every other one there.
                  <span key={label} className={i % 2 === 1 ? 'hidden sm:inline' : undefined}>
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </Section>

        <Section title="Weekly Distribution">
          {empty ? (
            <EmptyState>Finish a focus session to see your weekly stats</EmptyState>
          ) : (
            <>
              <div className="flex h-24 items-end gap-2.5 border-b border-white/12 pb-px">
                {stats.weekly.map((bar) => (
                  <div
                    key={bar.label}
                    title={bar.tip}
                    style={{ height: `${bar.h}%` }}
                    className="flex-1 rounded-t-[3px] bg-linear-180 from-accent-bright to-accent-deep transition hover:brightness-125"
                  />
                ))}
              </div>
              <div className="mt-1.5 flex gap-2.5">
                {stats.weekly.map((bar) => (
                  <span key={bar.label} className="flex-1 text-center text-[10.5px] text-ink-muted">
                    {bar.label}
                  </span>
                ))}
              </div>
            </>
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
      </section>
    </div>
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
  return (
    <div>
      {/* Scrolled right-to-left so today is anchored at the right edge. */}
      <div data-scroll-x className="overflow-x-auto [direction:rtl]">
        <div className="relative inline-block pt-4 [direction:ltr]" style={{ minWidth: columns * CELL }}>
          {stats.monthLabels.map((m) => (
            <span
              key={`${m.txt}-${m.col}`}
              className="absolute top-0 text-[10px] text-ink-muted"
              style={{ left: m.col * CELL }}
            >
              {m.txt}
            </span>
          ))}
          <div className="grid grid-flow-col grid-rows-7 gap-0.5 [grid-auto-columns:11px]">
            {stats.heatCells.map((cell, i) => (
              <div
                key={i}
                title={cell.tip}
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
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={danger ? cls.outlinePillDanger : cls.outlinePill}
      >
        {label}
      </button>
      <span className="text-[11px] leading-snug text-ink-muted">{hint}</span>
    </div>
  )
}
