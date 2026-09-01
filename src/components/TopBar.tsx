import { useEffect, useRef, useState } from 'react'
import type { PeerStatus } from '../types'
import { store } from '../store'
import { cls, Dot, Icons, Key, Tooltip } from './primitives'

export function TopBar({
  peers,
  onOpenHistory,
  onOpenPairing,
}: {
  peers: PeerStatus[]
  onOpenHistory: () => void
  onOpenPairing: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const connected = peers.filter((p) => p.state === 'connected')
  const connecting = peers.filter((p) => p.state === 'connecting')
  const tone = connected.length ? 'good' : connecting.length ? 'warn' : 'off'
  const label = connected.length
    ? `${connected.length} ${connected.length === 1 ? 'device' : 'devices'}`
    : connecting.length
      ? 'connecting'
      : 'not paired'

  return (
    <header className="flex items-center justify-between gap-3 px-4.5 pt-[calc(1.125rem+var(--safe-t))] sm:px-8 sm:pt-6.5">
      <div>
        {/* The only h1 on the page: without it the panels' h2s started an
            outline with nothing above them. */}
        <h1 className="text-[19px] leading-none font-semibold tracking-[-0.02em] sm:text-2xl">
          pwomwo<span className="text-accent">.</span>
        </h1>
        <p className="mt-1.5 text-[11px] leading-none tracking-[0.08em] text-ink-muted">
          focus timer
        </p>
      </div>

      <div ref={wrap} className="relative flex items-center gap-2.5">
        <Tooltip
          label={
            <>
              Your sessions, charts and export
              <Key>H</Key>
            </>
          }
        >
          <button
            type="button"
            className={cls.iconButton}
            aria-label="History and statistics"
            onClick={onOpenHistory}
          >
            {Icons.history}
          </button>
        </Tooltip>

        <Tooltip
          label={
            connected.length
              ? `Mirroring the timer with ${connected.map((p) => p.name).join(', ')}`
              : 'Pair a device to mirror the timer and merge history'
          }
        >
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="dialog"
            aria-label={`Synced devices: ${label}`}
            className="flex h-10 coarse:h-11 items-center gap-1.75 rounded-full border-[1.5px] border-white/35 bg-white/18 px-3.5 text-[12.5px] font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            <Dot tone={tone} />
            <span>{label}</span>
          </button>
        </Tooltip>

        {open ? (
          <div
            role="dialog"
            aria-label="Synced devices"
            className="absolute top-12 right-0 z-30 w-67 rounded-xl border border-white/12 bg-raised p-2 shadow-[0_16px_48px_rgb(0_0_0/0.5)] backdrop-blur-xl"
          >
            <div className="px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-ink-muted">
              SYNCED DEVICES
            </div>
            {peers.length === 0 ? (
              <p className="px-2.5 pb-2.5 text-[11.5px] leading-relaxed text-ink-muted">
                Nothing paired yet. Pair a device to share the timer and your history.
              </p>
            ) : (
              peers.map((p) => (
                <div
                  key={p.deviceId || p.name}
                  className="flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2.25 hover:bg-white/6"
                >
                  <span className="flex items-center gap-2.25 text-[13px] font-medium">
                    <Dot tone={p.state === 'connected' ? 'good' : p.state === 'connecting' ? 'warn' : 'off'} />
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                  <span className="flex items-center gap-2.5">
                    <span className="text-[11px] text-ink-muted">
                      {p.state === 'connected'
                        ? 'synced just now'
                        : p.state === 'connecting'
                          ? 'reconnecting…'
                          : 'offline'}
                    </span>
                    <button
                      type="button"
                      className="tap-pad text-[12px] font-medium text-bad/90 transition hover:text-bad-bright"
                      title="Unpair this device. History already merged stays."
                      onClick={() => void store.sync?.forget(p.deviceId)}
                    >
                      Forget
                    </button>
                  </span>
                </div>
              ))
            )}
            <div className="my-1.5 h-px bg-white/8" />
            <button
              type="button"
              className="flex w-full items-center gap-2.25 rounded-lg px-2.5 py-2.25 text-left text-[13px] font-medium text-accent transition hover:bg-white/6"
              onClick={() => {
                setOpen(false)
                onOpenPairing()
              }}
            >
              {Icons.add}
              {peers.length === 0 ? 'Pair a device' : 'Pair another device'}
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
