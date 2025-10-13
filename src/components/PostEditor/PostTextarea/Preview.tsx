import { Card } from '@/components/ui/card'
import { transformCustomEmojisInContent } from '@/lib/draft-event'
import { createFakeEvent } from '@/lib/event'
import { cleanUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import Content from '../../Content'

export default function Preview({ 
  content, 
  className,
  kind = 1 
}: { 
  content: string
  className?: string
  kind?: number
}) {
  const { content: processedContent, emojiTags } = useMemo(
    () => {
      // Clean tracking parameters from URLs in the preview
      const cleanedContent = content.replace(
        /(https?:\/\/[^\s]+)/g,
        (url) => {
          try {
            return cleanUrl(url)
          } catch {
            return url
          }
        }
      )
      return transformCustomEmojisInContent(cleanedContent)
    },
    [content]
  )
  return (
    <Card className={cn('p-3', className)}>
      <Content
        event={createFakeEvent({ 
          content: processedContent, 
          tags: emojiTags,
          kind 
        })}
        className="pointer-events-none h-full"
        mustLoadMedia
      />
    </Card>
  )
}
