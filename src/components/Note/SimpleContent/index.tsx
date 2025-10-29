import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { parseNostrContent, renderNostrContent } from '@/lib/nostr-parser.tsx'
import { cn } from '@/lib/utils'

export default function SimpleContent({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const parsedContent = useMemo(() => {
    return parseNostrContent(event.content, event)
  }, [event.content, event])

  return renderNostrContent(parsedContent, cn('prose prose-sm prose-zinc max-w-none break-words dark:prose-invert w-full', className))
}
