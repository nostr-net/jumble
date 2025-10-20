import { getImetaInfosFromEvent } from '@/lib/event'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import Content from '../Content'
import MediaPlayer from '../MediaPlayer'

export default function VideoNote({ event, className }: { event: Event; className?: string }) {
  const videoInfos = useMemo(() => getImetaInfosFromEvent(event), [event])
  
  // Extract URLs from content to avoid duplicate rendering
  const contentUrls = useMemo(() => {
    const content = event.content || ''
    const urlMatches = content.match(/https?:\/\/[^\s]+/g) || []
    return urlMatches.map(url => {
      try {
        return new URL(url).href
      } catch {
        return url
      }
    })
  }, [event.content])

  return (
    <div className={className}>
      <Content event={event} />
      {videoInfos
        .filter((video) => {
          // Only render videos from imeta tags that are not already in the content
          const videoUrl = new URL(video.url).href
          return !contentUrls.includes(videoUrl)
        })
        .map((video) => (
          <MediaPlayer src={video.url} key={video.url} className="mt-2" />
        ))}
    </div>
  )
}
