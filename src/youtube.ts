export interface YouTubeSource {
  videoId?: string
  playlistId?: string
  /** Canonical, validated URL; never persist or embed arbitrary input. */
  url: string
}

const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/
const PLAYLIST_ID = /^[a-zA-Z0-9_-]{10,150}$/
const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
])

/** Accept share, watch, Music, Shorts, live and playlist links, not iframe HTML. */
export function parseYouTubeLink(input: string): YouTubeSource | null {
  const text = input.trim()
  if (!text || text.length > 2048) return null
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
      return null
    const path = url.pathname.split('/').filter(Boolean)
    let videoId: string | undefined
    if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
      if (path.length !== 1) return null
      videoId = path[0]
    } else if (HOSTS.has(url.hostname)) {
      if (path.length === 1 && path[0] === 'watch') {
        videoId = url.searchParams.get('v') ?? undefined
      } else if (path.length === 2 && ['embed', 'shorts', 'live'].includes(path[0]!)) {
        if (path[1] !== 'videoseries') videoId = path[1]
      } else if (!(path.length === 1 && path[0] === 'playlist')) {
        return null
      }
    } else {
      return null
    }
    const playlistId = url.searchParams.get('list') ?? undefined
    if (videoId !== undefined && !VIDEO_ID.test(videoId)) return null
    if (playlistId !== undefined && !PLAYLIST_ID.test(playlistId)) return null
    if (!videoId && !playlistId) return null
    const canonical = new URL(videoId ? 'https://www.youtube.com/watch' : 'https://www.youtube.com/playlist')
    if (videoId) canonical.searchParams.set('v', videoId)
    if (playlistId) canonical.searchParams.set('list', playlistId)
    return { videoId, playlistId, url: canonical.href }
  } catch {
    return null
  }
}
