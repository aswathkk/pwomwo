/** Only loaded after the user opens Music and selects a YouTube link. */
export interface YouTubePlayer {
  pauseVideo(): void
  destroy(): void
  getIframe(): HTMLIFrameElement
}

interface PlayerEvent { target: YouTubePlayer; data: number }

interface YouTubeAPI {
  Player: new (element: HTMLElement, options: {
    width: string
    height: string
    videoId?: string
    playerVars: Record<string, string | number>
    events: {
      onReady: (event: PlayerEvent) => void
      onError: (event: PlayerEvent) => void
      onStateChange: (event: PlayerEvent) => void
    }
  }) => YouTubePlayer
}

type YouTubeWindow = Window & {
  YT?: YouTubeAPI
  onYouTubeIframeAPIReady?: () => void
}

let loading: Promise<YouTubeAPI> | null = null

export function loadYouTubeAPI(): Promise<YouTubeAPI> {
  const win = window as YouTubeWindow
  if (win.YT?.Player) return Promise.resolve(win.YT)
  if (loading) return loading
  loading = new Promise<YouTubeAPI>((resolve, reject) => {
    const script = document.createElement('script')
    const previous = win.onYouTubeIframeAPIReady
    const cleanup = () => {
      window.clearTimeout(timeout)
      win.onYouTubeIframeAPIReady = previous
    }
    const fail = () => {
      cleanup()
      script.remove()
      reject(new Error('YouTube could not load. Check your connection and try again.'))
    }
    const timeout = window.setTimeout(fail, 20_000)
    win.onYouTubeIframeAPIReady = () => {
      cleanup()
      if (win.YT?.Player) resolve(win.YT)
      else fail()
      previous?.()
    }
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = fail
    document.head.append(script)
  }).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}

export function youtubeErrorMessage(code: number): string {
  if (code === 100) return 'This video is unavailable or private. Try another YouTube link.'
  if (code === 101 || code === 150)
    return 'The owner does not allow this video to play here. Try another link or open it on YouTube.'
  if (code === 153)
    return 'YouTube could not verify this player. Try opening the music on YouTube.'
  return 'YouTube could not play this link. Try another video or playlist, or open it on YouTube.'
}
