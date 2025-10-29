import { Event } from 'nostr-tools'
import { useEventFieldParser } from '@/hooks/useContentParser'

export default function SimpleContent({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  // Use the comprehensive content parser but without ToC
  const { parsedContent, isLoading, error } = useEventFieldParser(event, 'content', {
    enableMath: true,
    enableSyntaxHighlighting: true
  })

  if (isLoading) {
    return <div className={className}>Loading...</div>
  }

  if (error) {
    return <div className={className}>Error loading content</div>
  }

  if (!parsedContent) {
    return <div className={className}>No content available</div>
  }

  return (
    <div className={`${parsedContent.cssClasses} ${className || ''}`}>
      {/* Render content without ToC and Article Info */}
      <div className="simple-content" dangerouslySetInnerHTML={{ __html: parsedContent.html }} />
    </div>
  )
}
