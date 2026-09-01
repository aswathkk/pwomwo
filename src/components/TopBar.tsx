import { useEffect, useState } from 'react'
import type { PeerStatus } from '../types'
import { store } from '../store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dot, Icons, Key } from './primitives'

/**
 * An offline row still carries the last time the two devices agreed, which is
 * the only thing that tells the user whether the pairing is stale or just idle.
 */
function lastSyncLabel(lastSyncAt: number | null): string {
  if (!lastSyncAt) return 'offline'
  const days = Math.floor((Date.now() - lastSyncAt) / 86_400_000)
  return days <= 0 ? 'offline · today' : `offline · ${days}d`
}

export function TopBar({
  peers,
  chromeHidden,
  onOpenHistory,
  onOpenPairing,
}: {
  peers: PeerStatus[]
  chromeHidden: boolean
  onOpenHistory: () => void
  onOpenPairing: () => void
}) {
  const [open, setOpen] = useState(false)

  // The popover portals to document.body, so the chrome fade cannot reach it;
  // close it when the chrome hides rather than leaving it floating over the
  // stage, anchored to an invisible trigger.
  useEffect(() => {
    if (chromeHidden) setOpen(false)
  }, [chromeHidden])

  const connected = peers.filter((p) => p.state === 'connected')
  const connecting = peers.filter((p) => p.state === 'connecting')
  const tone = connected.length ? 'good' : connecting.length ? 'warn' : 'off'
  // Paired but unreachable is not the same as unpaired, and after a reload it
  // is the common case: the connection dies with the page, the pairing does not.
  const label = connected.length
    ? `${connected.length} ${connected.length === 1 ? 'device' : 'devices'}`
    : connecting.length
      ? 'connecting'
      : peers.length
        ? 'offline'
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

      <div className="flex items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="glass"
              size="icon-lg"
              aria-label="History and statistics"
              onClick={onOpenHistory}
            >
              {Icons.history}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Your sessions, charts and export
            <Key>H</Key>
          </TooltipContent>
        </Tooltip>

        <Popover open={open} onOpenChange={setOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Synced devices: ${label}`}
                  className="coarse:h-11 flex h-10 items-center gap-1.75 rounded-full border-[1.5px] border-white/35 bg-white/18 px-3.5 text-[12.5px] font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
                >
                  <Dot tone={tone} />
                  <span>{label}</span>
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>
              {connected.length
                ? `Mirroring the timer with ${connected.map((p) => p.name).join(', ')}`
                : peers.length
                  ? 'Still paired, but not connected. Show a code on either device to reconnect.'
                  : 'Pair a device to mirror the timer and merge history'}
            </TooltipContent>
          </Tooltip>

          <PopoverContent align="end" sideOffset={8} className="w-67" aria-label="Synced devices">
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
                    <span className="text-[11px] whitespace-nowrap text-ink-muted">
                      {p.state === 'connected'
                        ? 'synced just now'
                        : p.state === 'connecting'
                          ? 'reconnecting…'
                          : lastSyncLabel(p.lastSyncAt)}
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
            <Separator className="my-1.5 bg-white/8" />
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
          </PopoverContent>
        </Popover>
      </div>
    </header>
  )
}
