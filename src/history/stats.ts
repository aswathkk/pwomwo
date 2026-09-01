import type { SessionRecord, WeekStart } from '../types'
import {
  addDays,
  dayKey,
  localDateOfRecord,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../util'

export interface StatBlock {
  n: number
  label: string
  avg: string | null
}

export interface Bar {
  h: number
  label: string
  tip: string
  count: number
}

export interface HeatCell {
  date: Date | null
  count: number
  level: 0 | 1 | 2 | 3 | 4
  tip: string
}

export interface MonthLabel {
  txt: string
  col: number
}

export interface Stats {
  total: number
  blocks: StatBlock[]
  daily: Bar[]
  hourLabels: string[]
  weekly: Bar[]
  heatCells: HeatCell[]
  monthLabels: MonthLabel[]
  heatTitle: string
  heatTotal: number
  firstRecordAt: number | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Bucket sizes offered inline on the Daily Distribution title (PRD HIS-3). */
export type BucketMinutes = 15 | 30 | 60 | 120

function fmtHour(minuteOfDay: number, hour12: boolean): string {
  const h = Math.floor(minuteOfDay / 60) % 24
  const m = minuteOfDay % 60
  const mm = String(m).padStart(2, '0')
  if (!hour12) return `${String(h).padStart(2, '0')}:${mm}`
  const hh = h % 12 === 0 ? 12 : h % 12
  return `${hh}:${mm} ${h < 12 ? 'AM' : 'PM'}`
}

function prefersHour12(): boolean {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 ?? false
  } catch {
    return true
  }
}

function fmtLongDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function plural(n: number): string {
  return n === 1 ? '1 focus session' : `${n} focus sessions`
}

export function computeStats(
  records: SessionRecord[],
  opts: { now?: Date; weekStart: WeekStart; bucket: BucketMinutes; heatMonths?: number },
): Stats {
  const now = opts.now ?? new Date()
  const heatMonths = opts.heatMonths ?? 9
  const sorted = [...records].sort((a, b) => a.endedAt - b.endedAt)
  const total = sorted.length
  const firstRecordAt = sorted.length ? sorted[0]!.endedAt : null

  // Today / week / month use *this device's* current boundaries, as Marinara does.
  const todayStart = startOfDay(now).getTime()
  const weekStartTs = startOfWeek(now, opts.weekStart).getTime()
  const monthStartTs = startOfMonth(now).getTime()
  const countSince = (ts: number) => sorted.filter((r) => r.endedAt >= ts).length

  // Averages divide the all-time total by elapsed days/weeks/months, min 1.
  const spanDays = firstRecordAt
    ? Math.max(1, Math.floor((startOfDay(now).getTime() - startOfDay(new Date(firstRecordAt)).getTime()) / 86_400_000) + 1)
    : 1
  const avg = (per: number) => (total / Math.max(1, per)).toFixed(2)

  const blocks: StatBlock[] = [
    { n: countSince(todayStart), label: 'Today', avg: `${avg(spanDays)} avg / day` },
    { n: countSince(weekStartTs), label: 'This Week', avg: `${avg(spanDays / 7)} avg / week` },
    {
      n: countSince(monthStartTs),
      label: now.toLocaleDateString(undefined, { month: 'long' }),
      avg: `${avg(spanDays / (365.25 / 12))} avg / month`,
    },
    {
      n: total,
      label: 'Total',
      avg: firstRecordAt
        ? `since ${new Date(firstRecordAt).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}`
        : null,
    },
  ]

  // ── Daily distribution ────────────────────────────────────────────────
  const hour12 = prefersHour12()
  const bucketCount = Math.round(1440 / opts.bucket)
  const dailyCounts = new Array<number>(bucketCount).fill(0)
  for (const r of sorted) {
    const local = localDateOfRecord(r.endedAt, r.tzOffsetMin)
    const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes()
    dailyCounts[Math.floor(minuteOfDay / opts.bucket) % bucketCount]!++
  }
  const dailyMax = Math.max(1, ...dailyCounts)
  const daily: Bar[] = dailyCounts.map((count, i) => ({
    count,
    h: count === 0 ? 0 : Math.max(3, Math.round((count / dailyMax) * 100)),
    label: fmtHour(i * opts.bucket, hour12),
    tip: `${plural(count)} between ${fmtHour(i * opts.bucket, hour12)} and ${fmtHour(
      ((i + 1) * opts.bucket) % 1440,
      hour12,
    )}`,
  }))
  const hourLabels: string[] = []
  for (let h = 0; h < 24; h += 3) hourLabels.push(fmtHour(h * 60, hour12))

  // ── Weekly distribution ───────────────────────────────────────────────
  const weekCounts = new Array<number>(7).fill(0)
  for (const r of sorted) {
    const local = localDateOfRecord(r.endedAt, r.tzOffsetMin)
    weekCounts[local.getUTCDay()]!++
  }
  const weekMax = Math.max(1, ...weekCounts)
  const weekly: Bar[] = []
  for (let i = 0; i < 7; i++) {
    const day = (opts.weekStart + i) % 7
    const count = weekCounts[day]!
    weekly.push({
      count,
      h: count === 0 ? 0 : Math.max(3, Math.round((count / weekMax) * 100)),
      label: WEEKDAYS[day]!,
      tip: `${plural(count)} on ${WEEKDAYS[day]}days`,
    })
  }

  // ── Heatmap ───────────────────────────────────────────────────────────
  const perDay = new Map<string, number>()
  for (const r of sorted) {
    const key = dayKey(localDateOfRecord(r.endedAt, r.tzOffsetMin))
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  const days = Math.round(heatMonths * 30.44)
  const rangeStart = startOfWeek(addDays(startOfDay(now), -days), opts.weekStart)
  const heatCells: HeatCell[] = []
  const monthLabels: MonthLabel[] = []
  const heatMax = Math.max(1, ...perDay.values())
  let prevMonth = -1
  let heatTotal = 0
  for (let d = new Date(rangeStart), col = 0; d <= now; d = addDays(d, 1)) {
    const idx = heatCells.length
    if (idx % 7 === 0) {
      col = idx / 7
      const m = d.getMonth()
      if (m !== prevMonth && col > 0) {
        monthLabels.push({ txt: MONTHS[m]!, col })
        prevMonth = m
      } else if (prevMonth === -1) {
        prevMonth = m
      }
    }
    const count = perDay.get(dayKey(d)) ?? 0
    heatTotal += count
    heatCells.push({
      date: new Date(d),
      count,
      level: count === 0 ? 0 : (Math.min(4, Math.ceil((count / heatMax) * 4)) as 1 | 2 | 3 | 4),
      tip: `${plural(count)} on ${fmtLongDate(d)}`,
    })
  }
  while (heatCells.length % 7 !== 0) heatCells.push({ date: null, count: 0, level: 0, tip: '' })

  return {
    total,
    blocks,
    daily,
    hourLabels,
    weekly,
    heatCells,
    monthLabels,
    heatTitle: `${heatTotal.toLocaleString()} focus ${
      heatTotal === 1 ? 'session' : 'sessions'
    } in the last ${heatMonths} months`,
    heatTotal,
    firstRecordAt,
  }
}
