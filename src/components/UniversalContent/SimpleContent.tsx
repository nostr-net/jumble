import { useMemo } from 'react'
import { cleanUrl } from '@/lib/url'
import { Event } from 'nostr-tools'
import { parseNostrContent, renderNostrContent } from '@/lib/nostr-parser.tsx'
import { cn } from '@/lib/utils'

interface SimpleContentProps {
  event?: Event
  content?: string
  className?: string
}

export default function SimpleContent({
  event,
  content,
  className
}: SimpleContentProps) {
  const processedContent = useMemo(() => {
    const rawContent = content || event?.content || ''
    
    // Clean URLs to remove tracking parameters
    const cleaned = rawContent.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => {
        try {
          return cleanUrl(url)
        } catch {
          return url
        }
      }
    )
    
    return cleaned
  }, [content, event?.content])

  // Parse content for nostr addresses and media
  const parsedContent = useMemo(() => {
    return parseNostrContent(processedContent, event)
  }, [processedContent, event])

  return (
    <div className={cn('prose prose-sm prose-zinc max-w-none break-words dark:prose-invert w-full', className)}>
      {renderNostrContent(parsedContent)}
    </div>
  )
}