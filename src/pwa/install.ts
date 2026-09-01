interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  for (const fn of listeners) fn()
})

export function onInstallAvailability(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function canPromptInstall(): boolean {
  return deferred !== null
}

export function isStandalone(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable'
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  for (const fn of listeners) fn()
  return outcome
}
