import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { cleanUrl } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import { Event } from 'nostr-tools'
import ImageWithLightbox from '../ImageWithLightbox'

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
  const imetaInfos = useMemo(() => event ? getImetaInfosFromEvent(event) : [], [event])
  
  const processedContent = useMemo(() => {
    const rawContent = content || event?.content || ''
    
    // Clean URLs
    let cleaned = rawContent.replace(
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

  const renderContent = () => {
    if (!processedContent) return null

    // Split content by lines and process each line
    const lines = processedContent.split('\n')
    const elements: JSX.Element[] = []
    let key = 0

    lines.forEach((line) => {
      // Check if line contains an image URL
      const imageMatch = line.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|heic|svg))/i)
      
      if (imageMatch) {
        const imageUrl = imageMatch[1]
        const imageInfo = imetaInfos.find((info) => info.url === imageUrl)
        const imageData = imageInfo || { url: imageUrl, pubkey: event?.pubkey }
        
        elements.push(
          <div key={key++} className="my-4">
            <ImageWithLightbox
              image={imageData}
              className="max-w-full h-auto rounded-lg cursor-zoom-in"
            />
          </div>
        )
        
        // Add the rest of the line as text if there's anything else
        const beforeImage = line.substring(0, imageMatch.index).trim()
        const afterImage = line.substring(imageMatch.index! + imageUrl.length).trim()
        
        if (beforeImage || afterImage) {
          elements.push(
            <div key={key++} className="mb-2">
              {beforeImage && <span>{beforeImage}</span>}
              {afterImage && <span>{afterImage}</span>}
            </div>
          )
        }
      } else {
        // Regular text line
        elements.push(
          <div key={key++} className="mb-1">
            {renderTextWithLinks(line)}
          </div>
        )
      }
    })

    return elements
  }

  const renderTextWithLinks = (text: string) => {
    // Simple link detection and rendering
    const linkRegex = /(https?:\/\/[^\s]+)/g
    const parts = text.split(linkRegex)
    
    return parts.map((part, index) => {
      if (linkRegex.test(part)) {
        return (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline break-words"
          >
            {part}
          </a>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  return (
    <div className={cn('text-wrap break-words whitespace-pre-wrap', className)}>
      {renderContent()}
    </div>
  )
}
