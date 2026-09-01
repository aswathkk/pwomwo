import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Settings, ThemeName, WeekStart } from '../types'
import { store } from '../store'
import { useAppState } from '../hooks/useStore'
import { defaultSettings, validate } from '../settings'
import { buildExport, download, ImportError, parseImport, toCsv } from '../history/io'
import { playSound, SOUNDS, type SoundName } from '../pwa/sound'
import {
  MAX_BPM,
  MIN_BPM,
  startTimerSound,
  TIMER_SOUND_NONE,
  TIMER_SOUNDS,
  timerSoundKind,
  timerSoundPlaying,
} from '../pwa/timer-sound'
import {
  notificationsSupported,
  permission,
  requestPermission,
} from '../pwa/notifications'
import { canPromptInstall, isIos, isStandalone, onInstallAvailability, promptInstall } from '../pwa/install'
import { confirmDialog } from '../ui/dialog-store'
import { clamp } from '../util'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cls, Dot, Row, Section, Stepper, Icons } from './primitives'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'timers', label: 'Timers' },
  { id: 'sounds', label: 'Sounds' },
  { id: 'sync', label: 'Sync' },
  { id: 'data', label: 'Data' },
] as const

/** Every pane scrolls on its own, inside the dialog's fixed height. */
const TAB_BODY = 'scroll-region flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-2'

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
    <Dialog
      open
      onOpenChange={(open) => {
        // Escape and outside clicks land here; the dirty check still runs.
        if (!open) void requestClose()
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="z-60 sm:w-220 sm:max-w-[calc(100vw-2rem)]"
      >
        <DialogHeader className="px-4.5 pt-4.5 sm:px-7 sm:pt-6">
          <DialogTitle>Settings</DialogTitle>
          <DialogClose asChild>
            <Button variant="soft" size="icon" aria-label="Close settings">
              {Icons.close}
            </Button>
          </DialogClose>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={setTab}
          className="flex min-h-0 flex-1 flex-col gap-3.5 px-4.5 py-4 sm:flex-row sm:gap-7 sm:px-7 sm:py-5"
        >
          <TabsList variant="side" aria-label="Settings sections">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                onClick={(e) => {
                  e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' })
                }}
              >
                {t.label}
                {t.id === 'sync' && state.peers.some((p) => p.state === 'connected') ? (
                  <Dot tone="good" />
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general" className={TAB_BODY}>
            <GeneralTab draft={draft} set={set} />
          </TabsContent>
          <TabsContent value="timers" className={TAB_BODY}>
            <TimersTab draft={draft} set={set} />
          </TabsContent>
          <TabsContent value="sounds" className={TAB_BODY}>
            <SoundsTab draft={draft} set={set} />
          </TabsContent>
          <TabsContent value="sync" className={TAB_BODY}>
            <SyncTab draft={draft} set={set} onPair={onPair} />
          </TabsContent>
          <TabsContent value="data" className={TAB_BODY}>
            <DataTab />
          </TabsContent>
        </Tabs>

        <DialogFooter className="justify-between border-t border-white/8 px-4.5 py-3.5 pb-[calc(0.875rem+var(--safe-b))] sm:px-7 sm:py-4.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="destructive" onClick={() => void resetAll()}>
                Reset all
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              Put every setting back to its default. History is untouched.
            </TooltipContent>
          </Tooltip>
          <div className="flex gap-2.5">
            <Button variant="secondary" onClick={() => void requestClose()}>
              Close
            </Button>
            <Button disabled={!dirty} onClick={() => void save()}>
              Save changes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <Switch
          aria-label="Show a notification when a phase ends"
          checked={draft.notificationsEnabled}
          onCheckedChange={(v) => void onToggleNotifications(v)}
        />
      </Row>

      <Row
        label="Keep the screen awake while a timer runs"
        hint="Uses the Screen Wake Lock API where the browser offers it."
      >
        <Switch
          aria-label="Keep the screen awake while a timer runs"
          checked={draft.keepScreenAwake}
          onCheckedChange={(v) => set('keepScreenAwake', v)}
        />
      </Row>

      <Row label="Week starts on" hint="Affects “This Week” and the weekly chart.">
        <Select
          value={String(draft.weekStart)}
          onValueChange={(v) => set('weekStart', Number(v) as WeekStart)}
        >
          <SelectTrigger aria-label="Week starts on" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sunday</SelectItem>
            <SelectItem value="1">Monday</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row label="Theme" hint="Minimal dark is used automatically when you ask to save data.">
        <Select value={draft.theme} onValueChange={(v) => set('theme', v as ThemeName)}>
          <SelectTrigger aria-label="Theme" className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="scene">Dusk sky</SelectItem>
            <SelectItem value="minimal">Minimal dark</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row
        label="Hide the controls while a timer runs"
        hint="They come back on any pointer or key press."
      >
        <Switch
          aria-label="Hide the controls while a timer runs"
          checked={draft.idleHideControls}
          onCheckedChange={(v) => set('idleHideControls', v)}
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
            <Button
              variant="outline"
              size="sm"
              disabled={!installable}
              onClick={() => void promptInstall()}
            >
              Install
            </Button>
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
              {/* Deliberately not the shared Input: a large bare number with
                  only an underline, styled nothing like a form field. */}
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
                className="tabular w-18 border-0 border-b border-white/12 bg-transparent pb-0.5 text-[30px] font-bold text-white outline-none"
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
        <Switch
          aria-label="Use the sequence"
          checked={draft.sequenceEnabled}
          onCheckedChange={(v) => set('sequenceEnabled', v)}
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
        <Switch
          aria-label="Start breaks automatically"
          checked={draft.autoStartBreaks}
          onCheckedChange={(v) => set('autoStartBreaks', v)}
        />
      </Row>

      <Row label="Start focus automatically after a break">
        <Switch
          aria-label="Start focus automatically after a break"
          checked={draft.autoStartFocus}
          onCheckedChange={(v) => set('autoStartFocus', v)}
        />
      </Row>

      <Row label="Reset the cycle" hint="Clears the dots under the focus pill.">
        <Button variant="outline" size="sm" onClick={store.resetCycle}>
          Reset cycle
        </Button>
      </Row>
    </>
  )
}

function SoundsTab({ draft, set }: { draft: Settings; set: Setter }) {
  const [preview, setPreview] = useState(false)
  const kind = timerSoundKind(draft.timerSound)

  // The preview follows the draft live, so tempo and volume can be dialled in
  // while it is sounding. `syncTimerSound` hands the bed back to the timer,
  // which is silence unless a focus session happens to be running behind us.
  useEffect(() => {
    if (preview && draft.timerSound !== TIMER_SOUND_NONE) {
      startTimerSound(draft.timerSound, draft.timerSoundVolume, draft.timerSoundBpm)
    } else {
      store.syncTimerSound()
    }
  }, [preview, draft.timerSound, draft.timerSoundVolume, draft.timerSoundBpm])

  // Any store commit can silence or replace the bed behind our back — a phase
  // completing, a paired device toggling the timer, a save. The engine is the
  // truth, so follow it rather than trusting the flag: runs after the effect
  // above, which has already (re)started the preview when one is wanted.
  useEffect(() => {
    if (preview && timerSoundPlaying() !== draft.timerSound) setPreview(false)
  })

  useEffect(() => () => store.syncTimerSound(), [])

  const periodic = TIMER_SOUNDS.filter((s) => s.kind === 'periodic')
  const ambient = TIMER_SOUNDS.filter((s) => s.kind === 'ambient')

  return (
    <>
      <Section title="When a phase ends">
        <div className="flex flex-col gap-2">
          <Row label="Play a sound when a phase ends">
            <Switch
              aria-label="Play a sound when a phase ends"
              checked={draft.soundEnabled}
              onCheckedChange={(v) => set('soundEnabled', v)}
            />
          </Row>

          <Row label="Alert sound">
            <div className="flex items-center gap-2.5">
              <Select value={draft.soundName} onValueChange={(v) => set('soundName', v)}>
                <SelectTrigger aria-label="Alert sound" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOUNDS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => playSound(draft.soundName as SoundName, draft.volume)}
              >
                Preview
              </Button>
            </div>
          </Row>

          <Row label="Volume" hint={`${Math.round(draft.volume * 100)}%`}>
            <Slider
              aria-label="Volume"
              min={0}
              max={100}
              value={[Math.round(draft.volume * 100)]}
              onValueChange={([v]) => set('volume', (v ?? 0) / 100)}
              onValueCommit={() => playSound(draft.soundName as SoundName, draft.volume)}
              className="coarse:h-11 h-4 w-40"
            />
          </Row>
        </div>
      </Section>

      <Section title="While focusing">
        <div className="flex flex-col gap-2">
          <Row
            label="Timer sound"
            hint="A beat to keep time by, or a bed to work under. It plays for the whole focus session and stops for breaks. Everything here is synthesised on the fly, so nothing is downloaded and it all works offline."
          >
            <div className="flex items-center gap-2.5">
              <Select value={draft.timerSound} onValueChange={(v) => set('timerSound', v)}>
                <SelectTrigger aria-label="Timer sound" className="min-w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TIMER_SOUND_NONE}>None</SelectItem>
                  <SelectGroup>
                    <SelectLabel>Periodic beat</SelectLabel>
                    {periodic.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Ambient noise</SelectLabel>
                    {ambient.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={preview}
                disabled={draft.timerSound === TIMER_SOUND_NONE}
                onClick={() => setPreview((on) => !on)}
              >
                {preview ? 'Stop' : 'Preview'}
              </Button>
            </div>
          </Row>

          {kind === 'periodic' ? (
            <Row label="Beat speed" hint={`${draft.timerSoundBpm} beats per minute`}>
              <Slider
                aria-label="Beat speed"
                min={MIN_BPM}
                max={MAX_BPM}
                step={5}
                value={[draft.timerSoundBpm]}
                onValueChange={([v]) => set('timerSoundBpm', v ?? MIN_BPM)}
                className="coarse:h-11 h-4 w-40"
              />
            </Row>
          ) : null}

          <Row
            label="Timer sound volume"
            hint={`${Math.round(draft.timerSoundVolume * 100)}%, separate from the alert above`}
          >
            <Slider
              aria-label="Timer sound volume"
              min={0}
              max={100}
              value={[Math.round(draft.timerSoundVolume * 100)]}
              onValueChange={([v]) => set('timerSoundVolume', (v ?? 0) / 100)}
              className="coarse:h-11 h-4 w-40"
            />
          </Row>
        </div>
      </Section>
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
        <Input
          type="text"
          aria-label="Device name"
          value={draft.deviceName}
          onChange={(e) => set('deviceName', e.target.value)}
          className="w-40"
        />
      </Row>

      <Row
        label="Allow internet (STUN) connections"
        hint="Off means same-network only: nothing is sent to any external server, and pairing works over Wi-Fi with no internet at all."
      >
        <Switch
          aria-label="Allow internet (STUN) connections"
          checked={draft.stunEnabled}
          onCheckedChange={(v) => set('stunEnabled', v)}
        />
      </Row>

      <div className={cls.card}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className={cls.sectionTitle}>Paired devices</h3>
          <Button variant="outline" size="sm" onClick={onPair}>
            Pair a device
          </Button>
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

      <div className={cls.card}>
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
        <Button
          variant="outline"
          size="sm"
          disabled={records.length === 0}
          onClick={() => download('history.csv', toCsv(records), 'text/csv;charset=utf-8')}
        >
          Save
        </Button>
      </Row>

      <Row label="Export" hint="A superset of Marinara's format, so the file imports into Marinara too.">
        <Button
          variant="outline"
          size="sm"
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
        </Button>
      </Row>

      <Row
        label="Import"
        hint="Accepts a pwomwo export, a Marinara history.json, or a Marinara history.csv. Merges by identity, so re-importing the same file adds nothing."
      >
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          Choose file
        </Button>
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
