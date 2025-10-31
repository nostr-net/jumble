import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { cleanUrl } from '@/lib/url'
import { useMediaExtraction } from '@/hooks/useMediaExtraction'
import Content from '../Content'
import MediaPlayer from '../MediaPlayer'

export default function VideoNote({ event, className }: { event: Event; className?: string }) {
  const { videos } = useMediaExtraction(event, event.content)
  
  // Extract cleaned URLs from content to avoid duplicate rendering
  const contentUrls = useMemo(() => {
    const content = event.content || ''
    const urlMatches = content.match(/https?:\/\/[^\s]+/g) || []
    return new Set(urlMatches.map(url => cleanUrl(url)))
  }, [event.content])

  // Videos that don't appear in content (from tags only)
  const videosFromTags = useMemo(() => {
    return videos.filter(video => !contentUrls.has(video.url))
  }, [videos, contentUrls])

  return (
    <div className={className}>
      <Content event={event} />
      {videosFromTags.map((video) => (
        <MediaPlayer src={video.url} key={video.url} className="mt-2" mustLoad={false} />
      ))}
    </div>
  )
}
