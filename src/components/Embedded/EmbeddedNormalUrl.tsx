import { cleanUrl, isImage, isMedia } from '@/lib/url'
import WebPreview from '../WebPreview'

export function EmbeddedNormalUrl({ url }: { url: string }) {
  // Clean tracking parameters from URLs before displaying/linking
  const cleanedUrl = cleanUrl(url)
  
  // Don't show WebPreview for images or media - they're handled elsewhere
  if (isImage(cleanedUrl) || isMedia(cleanedUrl)) {
    return (
      <a
        className="text-primary hover:underline"
        href={cleanedUrl}
        target="_blank"
        onClick={(e) => e.stopPropagation()}
        rel="noreferrer"
      >
        {cleanedUrl}
      </a>
    )
  }
  
  // Show WebPreview for all regular URLs (including those with nostr identifiers)
  return <WebPreview url={cleanedUrl} className="mt-2" />
}
