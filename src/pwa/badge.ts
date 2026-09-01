/** Remaining minutes on the app icon, where the platform supports it. */
export function setBadge(minutes: number | null): void {
  try {
    if (minutes === null) void navigator.clearAppBadge?.()
    else void navigator.setAppBadge?.(Math.max(0, minutes))
  } catch {
    /* unsupported */
  }
}
