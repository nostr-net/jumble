import { Card } from '@/components/ui/card'
import { transformCustomEmojisInContent } from '@/lib/draft-event'
import { createFakeEvent } from '@/lib/event'
import { cleanUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import { kinds, nip19 } from 'nostr-tools'
import { useMemo } from 'react'
import Content from '../../Content'
import Highlight from '../../Note/Highlight'
import { HighlightData } from '../HighlightEditor'

export default function Preview({ 
  content, 
  className,
  kind = 1,
  highlightData
}: { 
  content: string
  className?: string
  kind?: number
  highlightData?: HighlightData
}) {
  const { content: processedContent, emojiTags, highlightTags } = useMemo(
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
      const { content: processed, emojiTags: tags } = transformCustomEmojisInContent(cleanedContent)
      
      // Build highlight tags if this is a highlight
      let highlightTags: string[][] = []
      if (kind === kinds.Highlights && highlightData) {
        // Add source tag
        if (highlightData.sourceType === 'url') {
          highlightTags.push(['r', highlightData.sourceValue, 'source'])
        } else if (highlightData.sourceType === 'nostr') {
          // For preview, we'll use a simple e-tag with the source value
          // The actual tag building happens in createHighlightDraftEvent
          if (highlightData.sourceHexId) {
            highlightTags.push(['e', highlightData.sourceHexId])
          } else if (highlightData.sourceValue) {
            // Try to extract hex ID from bech32 if possible
            try {
              const decoded = nip19.decode(highlightData.sourceValue)
              if (decoded.type === 'note' || decoded.type === 'nevent') {
                const hexId = decoded.type === 'note' ? decoded.data : decoded.data.id
                highlightTags.push(['e', hexId])
              } else if (decoded.type === 'naddr') {
                const { kind, pubkey, identifier } = decoded.data
                highlightTags.push(['a', `${kind}:${pubkey}:${identifier}`])
              }
            } catch {
              // If decoding fails, just use the source value as-is for preview
              highlightTags.push(['r', highlightData.sourceValue])
            }
          }
        }
        
        // Add context tag if provided
        if (highlightData.context) {
          highlightTags.push(['context', highlightData.context])
        }
      }
      
      return {
        content: processed,
        emojiTags: tags,
        highlightTags
      }
    },
    [content, kind, highlightData]
  )
  
  // Combine emoji tags and highlight tags
  const allTags = useMemo(() => {
    return [...emojiTags, ...highlightTags]
  }, [emojiTags, highlightTags])
  
  const fakeEvent = useMemo(() => {
    return createFakeEvent({ 
      content: processedContent, 
      tags: allTags,
      kind 
    })
  }, [processedContent, allTags, kind])
  
  // For highlights, use the Highlight component for proper formatting
  if (kind === kinds.Highlights) {
    return (
      <Card className={cn('p-3', className)}>
        <Highlight
          event={fakeEvent}
          className="pointer-events-none"
        />
      </Card>
    )
  }
  
  return (
    <Card className={cn('p-3', className)}>
      <Content
        event={fakeEvent}
        className="pointer-events-none h-full"
        mustLoadMedia
      />
    </Card>
  )
}
