/** Replaced with `true` by the production build; absent in development. */
declare const __PROD__: boolean | undefined

interface Navigator {
  /** Chromium-only; used for the remaining-minutes app badge (PRD PWA-7). */
  setAppBadge?: (n?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/** Shipping in Chromium; the jsQR fallback covers everything else. */
declare class BarcodeDetector {
  constructor(options?: { formats: string[] })
  static getSupportedFormats(): Promise<string[]>
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

declare module '*.css' {
  const css: string
  export default css
}

declare module '*.html' {
  const html: unknown
  export default html
}
