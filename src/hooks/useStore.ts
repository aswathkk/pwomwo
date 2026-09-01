import { useSyncExternalStore } from 'react'
import { store, type Snapshot } from '../store'
import { getPendingConfirm, subscribeDialog, type PendingConfirm } from '../ui/dialog-store'

export function useAppState(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function usePendingConfirm(): PendingConfirm | null {
  return useSyncExternalStore(subscribeDialog, getPendingConfirm, getPendingConfirm)
}
