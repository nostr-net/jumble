import { cleanUrl } from '@/lib/url'
import React from 'react'

export function EmbeddedNormalUrl({ url, children }: { url: string; children?: React.ReactNode }) {
  // Clean tracking parameters from URLs before displaying/linking
  const cleanedUrl = cleanUrl(url)
  
  // Render all URLs as green text links (like hashtags) - WebPreview cards shown at bottom
  return (
    <a
      className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline"
      href={cleanedUrl}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      rel="noreferrer noopener"
    >
      {children || cleanedUrl}
    </a>
  )
}
