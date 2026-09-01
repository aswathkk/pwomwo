import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings, ThemeName, WeekStart } from '../types'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { useOverlay } from '../hooks/useOverlay'
import { defaultSettings, validate } from '../settings'
import { buildExport, download, ImportError, parseImport, toCsv } from '../history/io'
import { playSound, SOUNDS, type SoundName } from '../pwa/sound'
import {
  notificationsSupported,
  permission,
  requestPermission,
} from '../pwa/notifications'
import { canPromptInstall, isIos, isStandalone, onInstallAvailability, promptInstall } from '../pwa/install'
import { confirmDialog } from '../ui/dialog-store'
import { clamp } from '../util'
import { cls, Dot, Row, Stepper, Toggle, Tooltip, Icons } from './primitives'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'timers', label: 'Timers' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'sync', label: 'Sync' },
  { id: 'data', label: 'Data' },
] as const

export function SettingsModal({
  initialTab,
  onClose,
  onPair,
}: {
  initialTab: string
  onClose: () => void
  onPair: () => void
}) {
  const state = useAppState()
  const [tab, setTab] = useState(initialTab)
  const [draft, setDraft] = useState<Settings>(state.settings)
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(state.settings),
    [draft, state.settings],
  )

  const requestClose = useCallback(async () => {
    if (!dirty) {
      onClose()
      return
    }
    const { confirmed } = await confirmDialog({
      title: 'Discard unsaved changes?',
      body: 'Your edits to settings have not been saved yet.',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (confirmed) onClose()
  }, [dirty, onClose])

  const ref = useOverlay<HTMLDivElement>(() => void requestClose())
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft((d) => validate({ ...d, [key]: value }))

  const save = async () => {
    await store.updateSettings(validate(draft))
    store.notify('Settings saved', 'good')
    onClose()
  }

  const resetAll = async () => {
    const { confirmed } = await confirmDialog({
      title: 'Reset every setting to its default?',
      body: 'Your history and paired devices are not affected.',
      confirmLabel: 'Reset all',
      danger: true,
    })
    if (!confirmed) return
    setDraft(validate({ ...defaultSettings(), deviceName: draft.deviceName }))
  }

  return (
    <div
      className="fixed inset-0 z-60 flex items-end justify-center bg-scrim p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) void requestClose()
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/9 bg-modal shadow-[0_30px_80px_rgb(0_0_0/0.6)] sm:max-h-[min(620px,calc(100dvh-2rem))] sm:w-220 sm:rounded-3xl"
      >
        <header className="flex items-center justify-between px-4.5 pt-4.5 sm:px-7 sm:pt-6">
          <h2 className="text-[19px] font-semibold">Settings</h2>
          <button
            type="button"
            className={cls.closeButton}
            aria-label="Close settings"
            onClick={() => void requestClose()}
          >
            {Icons.close}
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-4.5 py-4 sm:flex-row sm:gap-7 sm:px-7 sm:py-5">
          <div
            role="tablist"
            aria-label="Settings sections"
            className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto sm:w-42 sm:flex-col sm:gap-1"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={(e) => {
                  setTab(t.id)
                  e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' })
                }}
                className={`flex h-9.5 coarse:h-11 shrink-0 items-center gap-2 rounded-lg px-3.5 text-left text-[13.5px] transition ${
                  tab === t.id
                    ? 'bg-accent-soft font-semibold text-accent-bright'
                    : 'font-medium text-ink-muted hover:bg-white/6'
                }`}
              >
                {t.label}
                {t.id === 'sync' && state.peers.some((p) => p.state === 'connected') ? (
                  <Dot tone="good" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="scroll-region flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2">
            {tab === 'general' ? <GeneralTab draft={draft} set={set} /> : null}
            {tab === 'timers' ? <TimersTab draft={draft} set={set} /> : null}
            {tab === 'sounds' ? <SoundsTab draft={draft} set={set} /> : null}
            {tab === 'sync' ? <SyncTab draft={draft} set={set} onPair={onPair} /> : null}
            {tab === 'data' ? <DataTab /> : null}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2.5 border-t border-white/8 px-4.5 py-3.5 pb-[calc(0.875rem+var(--safe-b))] sm:px-7 sm:py-4.5">
          <Tooltip side="top" label="Put every setting back to its default. History is untouched.">
            <button type="button" className={cls.buttonDanger} onClick={() => void resetAll()}>
              Reset all
            </button>
          </Tooltip>
          <div className="flex gap-2.5">
            <button type="button" className={cls.button} onClick={() => void requestClose()}>
              Close
            </button>
            <button
              type="button"
              className={cls.buttonPrimary}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save changes
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}

type Setter = <K extends keyof Settings>(key: K, value: Settings[K]) => void

function GeneralTab({ draft, set }: { draft: Settings; set: Setter }) {
  const [perm, setPerm] = useState(permission())
  const [installable, setInstallable] = useState(canPromptInstall())
  useEffect(() => onInstallAvailability(() => setInstallable(canPromptInstall())), [])

  const onToggleNotifications = async (next: boolean) => {
    if (!next) {
      set('notificationsEnabled', false)
      return
    }
    // Permission is only ever requested from this gesture, never on load.
    const result = await requestPermission()
    setPerm(result)
    set('notificationsEnabled', result === 'granted')
    if (result !== 'granted') store.notify('Notifications are blocked in your browser settings', 'warn')
  }

  return (
    <>
      <Row
        label="Show a notification when a phase ends"
        hint={
          !notificationsSupported()
            ? 'This browser does not support notifications.'
            : perm === 'denied'
              ? 'Blocked in your browser settings. Allow notifications for this site first.'
              : 'There is no push server by design, so alerts only fire while pwomwo is open. On iOS, install to the Home Screen; a suspended phone alerts when you next open it, and a paired laptop alerts on time.'
        }
      >
        <Toggle
          label="Show a notification when a phase ends"
          checked={draft.notificationsEnabled}
          onChange={(v) => void onToggleNotifications(v)}
        />
      </Row>

      <Row
        label="Keep the screen awake while a timer runs"
        hint="Uses the Screen Wake Lock API where the browser offers it."
      >
        <Toggle
          label="Keep the screen awake while a timer runs"
          checked={draft.keepScreenAwake}
          onChange={(v) => set('keepScreenAwake', v)}
        />
      </Row>

      <Row label="Week starts on" hint="Affects “This Week” and the weekly chart.">
        <select
          aria-label="Week starts on"
          value={draft.weekStart}
          onChange={(e) => set('weekStart', Number(e.target.value) as WeekStart)}
          className="h-9 coarse:h-11 min-w-40 rounded-lg border border-white/12 bg-white/6 px-2.5 text-[13px] font-medium"
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </Row>

      <Row label="Theme" hint="Minimal dark is used automatically when you ask to save data.">
        <select
          aria-label="Theme"
          value={draft.theme}
          onChange={(e) => set('theme', e.target.value as ThemeName)}
          className="h-9 coarse:h-11 min-w-40 rounded-lg border border-white/12 bg-white/6 px-2.5 text-[13px] font-medium"
        >
          <option value="scene">Dusk sky</option>
          <option value="minimal">Minimal dark</option>
        </select>
      </Row>

      <Row
        label="Hide the controls while a timer runs"
        hint="They come back on any pointer or key press."
      >
        <Toggle
          label="Hide the controls while a timer runs"
          checked={draft.idleHideControls}
          onChange={(v) => set('idleHideControls', v)}
        />
      </Row>

      {!isStandalone() ? (
        <Row
          label="Install as an app"
          hint={
            isIos()
              ? 'On iOS: tap Share, then “Add to Home Screen”. Notifications need the installed app.'
              : 'Runs offline in its own window, with an app badge for the remaining minutes.'
          }
        >
          {isIos() ? null : (
            <button
              type="button"
              className={cls.outlinePill}
              disabled={!installable}
              onClick={() => void promptInstall()}
            >
              Install
            </button>
          )}
        </Row>
      ) : null}
    </>
  )
}

function TimersTab({ draft, set }: { draft: Settings; set: Setter }) {
  const durations: { key: keyof Settings; label: string }[] = [
    { key: 'focusMin', label: 'Focus' },
    { key: 'shortBreakMin', label: 'Short break' },
    { key: 'longBreakMin', label: 'Long break' },
  ]

  return (
    <>
      <div className="flex flex-wrap gap-3.5">
        {durations.map((d) => (
          <div key={d.key} className="min-w-35 flex-1 rounded-xl border border-white/8 bg-white/4 p-4">
            <label className="mb-2.5 block text-[12px] font-medium text-ink-muted" htmlFor={d.key}>
              {d.label}
            </label>
            <div className="flex items-baseline gap-1.5">
              <input
                id={d.key}
                type="number"
                inputMode="numeric"
                min={1}
                max={180}
                value={draft[d.key] as number}
                onChange={(e) =>
                  set(d.key, clamp(Number(e.target.value) || 1, 1, 180) as never)
                }
                className="w-18 border-0 border-b border-white/12 bg-transparent pb-0.5 text-[30px] font-bold tabular text-white outline-none"
              />
              <span className="text-[12px] text-ink-muted">min</span>
            </div>
          </div>
        ))}
      </div>

      <Row
        label="Use the sequence"
        hint={
          <>
            focus → short break, then a long break after every{' '}
            <b>{draft.longBreakEvery}</b> focus sessions
          </>
        }
      >
        <Toggle
          label="Use the sequence"
          checked={draft.sequenceEnabled}
          onChange={(v) => set('sequenceEnabled', v)}
        />
      </Row>

      <Row label="Long break after every">
        <Stepper
          label="long break interval"
          value={draft.longBreakEvery}
          min={2}
          max={8}
          suffix="sessions"
          onChange={(v) => set('longBreakEvery', v)}
        />
      </Row>

      <Row label="Start breaks automatically">
        <Toggle
          label="Start breaks automatically"
          checked={draft.autoStartBreaks}
          onChange={(v) => set('autoStartBreaks', v)}
        />
      </Row>

      <Row label="Start focus automatically after a break">
        <Toggle
          label="Start focus automatically after a break"
          checked={draft.autoStartFocus}
          onChange={(v) => set('autoStartFocus', v)}
        />
      </Row>

      <Row label="Reset the cycle" hint="Clears the dots under the focus pill.">
        <button type="button" className={cls.outlinePill} onClick={store.resetCycle}>
          Reset cycle
        </button>
      </Row>
    </>
  )
}

function SoundsTab({ draft, set }: { draft: Settings; set: Setter }) {
  return (
    <>
      <Row label="Play a sound when a phase ends">
        <Toggle
          label="Play a sound when a phase ends"
          checked={draft.soundEnabled}
          onChange={(v) => set('soundEnabled', v)}
        />
      </Row>

      <Row label="Alert sound">
        <div className="flex items-center gap-2.5">
          <select
            aria-label="Alert sound"
            value={draft.soundName}
            onChange={(e) => set('soundName', e.target.value)}
            className="h-9 coarse:h-11 min-w-40 rounded-lg border border-white/12 bg-white/6 px-2.5 text-[13px] font-medium"
          >
            {SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={cls.outlinePill}
            onClick={() => playSound(draft.soundName as SoundName, draft.volume)}
          >
            Preview
          </button>
        </div>
      </Row>

      <Row label="Volume" hint={`${Math.round(draft.volume * 100)}%`}>
        <input
          type="range"
          aria-label="Volume"
          min={0}
          max={100}
          value={Math.round(draft.volume * 100)}
          onChange={(e) => set('volume', Number(e.target.value) / 100)}
          onMouseUp={() => playSound(draft.soundName as SoundName, draft.volume)}
          className="h-4 coarse:h-11 w-40 accent-accent"
        />
      </Row>
    </>
  )
}

function SyncTab({
  draft,
  set,
  onPair,
}: {
  draft: Settings
  set: Setter
  onPair: () => void
}) {
  const state = useAppState()
  return (
    <>
      <Row label="This device's name" hint="Shown on your other devices.">
        <input
          type="text"
          aria-label="Device name"
          value={draft.deviceName}
          onChange={(e) => set('deviceName', e.target.value)}
          className="h-9 coarse:h-11 min-w-40 rounded-lg border border-white/12 bg-white/6 px-2.5 text-[13px] font-medium"
        />
      </Row>

      <Row
        label="Allow internet (STUN) connections"
        hint="Off means same-network only: nothing is sent to any external server, and pairing works over Wi-Fi with no internet at all."
      >
        <Toggle
          label="Allow internet (STUN) connections"
          checked={draft.stunEnabled}
          onChange={(v) => set('stunEnabled', v)}
        />
      </Row>

      <div className="rounded-xl border border-white/8 bg-white/4 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className={cls.sectionTitle}>Paired devices</h3>
          <button type="button" className={cls.outlinePill} onClick={onPair}>
            Pair a device
          </button>
        </div>
        {state.peers.length === 0 ? (
          <p className={cls.hint}>
            Nothing paired. Pairing is a QR scan between your own screens, with no account and no server.
          </p>
        ) : (
          state.peers.map((p) => (
            <div
              key={p.deviceId || p.name}
              className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3.5 py-2.5"
            >
              <span className="flex items-center gap-2.25 text-[13px] font-medium">
                <Dot tone={p.state === 'connected' ? 'good' : p.state === 'connecting' ? 'warn' : 'off'} />
                {p.name}
                <span className="text-[11px] font-normal text-ink-muted">
                  {p.state === 'connected' ? 'synced just now' : p.state}
                </span>
              </span>
              <button
                type="button"
                className="tap-pad text-[12px] font-medium text-bad/90 transition hover:text-bad-bright"
                title="Unpair this device. History already merged stays."
                onClick={() => void store.sync?.forget(p.deviceId)}
              >
                Forget
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-white/8 bg-white/4 p-4">
        <h3 className={`${cls.sectionTitle} mb-2`}>Network &amp; privacy</h3>
        <ul className={`${cls.hint} list-disc space-y-1 pl-4`}>
          <li>No analytics, telemetry or third-party scripts. Nothing is stored on a server.</li>
          <li>
            Outbound traffic is limited to this site&apos;s own assets, the paired device itself, and (only
            with the switch above on) a public STUN lookup.
          </li>
          <li>
            There is deliberately no relay, so devices on very restrictive networks (often mobile data) may
            not be able to connect. The same Wi-Fi always works.
          </li>
        </ul>
      </div>
    </>
  )
}

function DataTab() {
  const state = useAppState()
  const fileInput = useRef<HTMLInputElement>(null)
  const records = useMemo(() => store.repo.all(), [state.historyVersion])

  const onImportFile = async (file: File) => {
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

  return (
    <>
      <Row label="Save as CSV" hint="Marinara's exact columns, so existing spreadsheets keep working.">
        <button
          type="button"
          className={cls.outlinePill}
          disabled={records.length === 0}
          onClick={() => download('history.csv', toCsv(records), 'text/csv;charset=utf-8')}
        >
          Save
        </button>
      </Row>

      <Row label="Export" hint="A superset of Marinara's format, so the file imports into Marinara too.">
        <button
          type="button"
          className={cls.outlinePill}
          disabled={records.length === 0}
          onClick={() =>
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
          }
        >
          Export
        </button>
      </Row>

      <Row
        label="Import"
        hint="Accepts a pwomwo export, a Marinara history.json, or a Marinara history.csv. Merges by identity, so re-importing the same file adds nothing."
      >
        <button type="button" className={cls.outlinePill} onClick={() => fileInput.current?.click()}>
          Choose file
        </button>
      </Row>

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

      <p className={cls.hint}>
        {records.length.toLocaleString()} sessions stored on this device.
      </p>
    </>
  )
}
