import type { SessionRecord, Tombstone } from '../types'
import { clear, getAll, putMany, put } from '../db'
import { dayKey, fnv1a, localDateOfRecord } from '../util'

/**
 * History is a grow-only set keyed by record id (PRD SYN-17): merges are a
 * union, records are never edited, and deletes leave tombstones so a peer that
 * missed a clear cannot resurrect them.
 */
export class HistoryRepo {
  private cache: Map<string, SessionRecord> | null = null
  private tombstones = new Set<string>()
  private readonly listeners = new Set<() => void>()

  async load(): Promise<void> {
    const [records, tombs] = await Promise.all([
      getAll<SessionRecord>('sessions'),
      getAll<Tombstone>('tombstones'),
    ])
    this.cache = new Map(records.map((r) => [r.id, r]))
    this.tombstones = new Set(tombs.map((t) => t.id))
    void this.pruneTombstones(tombs)
  }

  private async pruneTombstones(tombs: Tombstone[]): Promise<void> {
    const cutoff = Date.now() - 30 * 86_400_000
    const stale = tombs.filter((t) => t.deletedAt < cutoff)
    if (stale.length === 0) return
    for (const t of stale) this.tombstones.delete(t.id)
    const { del } = await import('../db')
    await Promise.all(stale.map((t) => del('tombstones', t.id)))
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }

  all(): SessionRecord[] {
    return [...(this.cache?.values() ?? [])].sort((a, b) => a.endedAt - b.endedAt)
  }

  get size(): number {
    return this.cache?.size ?? 0
  }

  has(id: string): boolean {
    return this.cache?.has(id) ?? false
  }

  /** Add records, skipping anything already present or tombstoned. Returns counts. */
  async merge(records: SessionRecord[]): Promise<{ added: number; skipped: number }> {
    if (!this.cache) await this.load()
    const fresh: SessionRecord[] = []
    let skipped = 0
    for (const r of records) {
      if (this.cache!.has(r.id) || this.tombstones.has(r.id)) {
        skipped++
        continue
      }
      this.cache!.set(r.id, r)
      fresh.push(r)
    }
    if (fresh.length) {
      await putMany('sessions', fresh)
      this.emit()
    }
    return { added: fresh.length, skipped }
  }

  async add(record: SessionRecord): Promise<boolean> {
    const { added } = await this.merge([record])
    return added === 1
  }

  async clearAll(): Promise<number> {
    if (!this.cache) await this.load()
    const ids = [...this.cache!.keys()]
    const now = Date.now()
    await clear('sessions')
    await putMany(
      'tombstones',
      ids.map<Tombstone>((id) => ({ id, deletedAt: now })),
    )
    for (const id of ids) this.tombstones.add(id)
    this.cache!.clear()
    this.emit()
    return ids.length
  }

  /**
   * `YYYY-MM-DD → {count, hash}` over the *recording device's* local day, so
   * both sides bucket identically no matter where they are now (PRD SYN-18).
   */
  digest(): Record<string, { count: number; hash: number }> {
    const out: Record<string, { count: number; hash: number }> = {}
    for (const r of this.all()) {
      const key = dayKey(localDateOfRecord(r.endedAt, r.tzOffsetMin))
      const slot = (out[key] ??= { count: 0, hash: 0 })
      slot.count++
      slot.hash = (slot.hash ^ fnv1a(r.id)) >>> 0
    }
    return out
  }

  recordsForDays(days: string[]): SessionRecord[] {
    const want = new Set(days)
    return this.all().filter((r) =>
      want.has(dayKey(localDateOfRecord(r.endedAt, r.tzOffsetMin))),
    )
  }

  async rememberTombstones(ids: string[]): Promise<void> {
    const now = Date.now()
    for (const id of ids) this.tombstones.add(id)
    await putMany('tombstones', ids.map<Tombstone>((id) => ({ id, deletedAt: now })))
  }

  /** Persist the last known timer document so a reload resumes the countdown. */
  static async saveTimer(doc: unknown): Promise<void> {
    await put('timer', doc, 'current')
  }
}
