import { describe, expect, test } from 'bun:test'
import { parseYouTubeLink } from '../src/youtube'
import { youtubeErrorMessage } from '../src/pwa/youtube-player'

const video = 'jfKfPfyJRdk'
const playlist = 'PL1234567890_abcdef'

describe('YouTube music links', () => {
  test.each([
    `https://www.youtube.com/watch?v=${video}`,
    `https://youtu.be/${video}?si=tracking`,
    `https://m.youtube.com/watch?v=${video}&t=60`,
    `https://music.youtube.com/watch?v=${video}`,
    `https://www.youtube.com/shorts/${video}`,
    `https://www.youtube.com/live/${video}`,
    `https://www.youtube-nocookie.com/embed/${video}`,
    `youtube.com/watch?v=${video}`,
    `  https://youtu.be/${video}  `,
  ])('accepts %s and strips tracking parameters', (link) => {
    expect(parseYouTubeLink(link)).toEqual({
      videoId: video, playlistId: undefined, url: `https://www.youtube.com/watch?v=${video}`,
    })
  })

  test('preserves a video within a playlist', () => {
    expect(parseYouTubeLink(`https://music.youtube.com/watch?v=${video}&list=${playlist}&si=tracking`))
      .toEqual({ videoId: video, playlistId: playlist, url: `https://www.youtube.com/watch?v=${video}&list=${playlist}` })
  })

  test.each([
    `https://www.youtube.com/playlist?list=${playlist}`,
    `https://music.youtube.com/playlist?list=${playlist}`,
    `https://www.youtube.com/embed/videoseries?list=${playlist}`,
  ])('accepts playlist-only link %s', (link) => {
    expect(parseYouTubeLink(link)).toEqual({
      videoId: undefined, playlistId: playlist, url: `https://www.youtube.com/playlist?list=${playlist}`,
    })
  })

  test.each([
    '', 'not a link', video,
    'javascript:alert(1)',
    `<iframe src="https://www.youtube.com/embed/${video}"></iframe>`,
    `https://youtube.com.evil.example/watch?v=${video}`,
    `https://evil.example/youtube.com/watch?v=${video}`,
    `https://www.youtube.com@evil.example/watch?v=${video}`,
    `https://evil.example@youtube.com/watch?v=${video}`,
    `https://youtube.com:444/watch?v=${video}`,
    `https://youtube.com/redirect?v=${video}`,
    'https://youtube.com/watch?v=invalid',
    'https://youtube.com/watch?v=',
    'https://youtube.com/playlist?list=',
    `https://youtube.com/watch?v=${video}&list=<script>`,
    `https://youtu.be/${video}/extra`,
    'https://youtube.com/',
  ])('rejects invalid or untrusted input %s', (link) => {
    expect(parseYouTubeLink(link)).toBeNull()
  })
})

describe('YouTube playback errors', () => {
  test('explains disabled embedding and unavailable videos', () => {
    expect(youtubeErrorMessage(150)).toContain('does not allow')
    expect(youtubeErrorMessage(101)).toContain('open it on YouTube')
    expect(youtubeErrorMessage(100)).toContain('unavailable or private')
    expect(youtubeErrorMessage(153)).toContain('verify')
    expect(youtubeErrorMessage(5)).toContain('Try another')
  })
})
