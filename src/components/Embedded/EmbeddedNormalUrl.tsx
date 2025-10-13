import { cleanUrl } from '@/lib/url'

export function EmbeddedNormalUrl({ url }: { url: string }) {
  // Clean tracking parameters from URLs before displaying/linking
  const cleanedUrl = cleanUrl(url)
  
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
