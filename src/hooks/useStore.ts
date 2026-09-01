import { useSyncExternalStore } from 'react'
import { store, type Snapshot } from '../store'
import { getToasts, subscribeToasts, type ToastItem } from '../ui/toast-store'
import { getPendingConfirm, subscribeDialog, type PendingConfirm } from '../ui/dialog-store'

export function useAppState(): Snapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}

export function useToasts(): ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts, getToasts)
}

export function usePendingConfirm(): PendingConfirm | null {
  return useSyncExternalStore(subscribeDialog, getPendingConfirm, getPendingConfirm)
}
