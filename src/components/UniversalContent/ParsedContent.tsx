/**
 * Universal content component that uses the content parser service
 * for all Nostr content fields
 */

import { useEventFieldParser } from '@/hooks/useContentParser'
import { Event } from 'nostr-tools'
import ImageWithLightbox from '../ImageWithLightbox'
import WebPreview from '../WebPreview'
import HighlightSourcePreview from './HighlightSourcePreview'

interface ParsedContentProps {
  event: Event
  field: 'content' | 'title' | 'summary' | 'description'
  className?: string
  enableMath?: boolean
  enableSyntaxHighlighting?: boolean
  showMedia?: boolean
  showLinks?: boolean
  showHashtags?: boolean
  showNostrLinks?: boolean
  showHighlightSources?: boolean
}

export default function ParsedContent({
  event,
  field,
  className = '',
  enableMath = true,
  enableSyntaxHighlighting = true,
  showMedia = true,
  showLinks = false,
  showHashtags = false,
  showNostrLinks = false,
  showHighlightSources = false,
}: ParsedContentProps) {
  const { parsedContent, isLoading, error } = useEventFieldParser(event, field, {
    enableMath,
    enableSyntaxHighlighting
  })


  if (isLoading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-muted rounded w-1/2"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`text-red-500 text-sm ${className}`}>
        Error loading content: {error.message}
      </div>
    )
  }

  if (!parsedContent) {
    return (
      <div className={`text-muted-foreground text-sm ${className}`}>
        No content available
      </div>
    )
  }

  return (
    <div className={`${parsedContent.cssClasses} ${className}`}>
      {/* Render AsciiDoc content (everything is now processed as AsciiDoc) */}
      <div dangerouslySetInnerHTML={{ __html: parsedContent.html }} />

      {/* Media thumbnails */}
      {showMedia && parsedContent.media.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Images in this content:</h4>
          <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 gap-1">
            {parsedContent.media.map((media, index) => (
              <div key={index} className="aspect-square">
                <ImageWithLightbox
                  image={media}
                  className="w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  classNames={{
                    wrapper: 'w-full h-full'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Links summary with OpenGraph previews */}
      {showLinks && parsedContent.links.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Links in this content:</h4>
          <div className="space-y-3">
            {parsedContent.links.map((link, index) => (
              <WebPreview
                key={index}
                url={link.url}
                className="w-full"
              />
            ))}
          </div>
        </div>
      )}

      {/* Hashtags */}
      {showHashtags && parsedContent.hashtags.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2">
          {parsedContent.hashtags.map((tag) => (
            <div
              key={tag}
              title={tag}
              className="flex items-center rounded-full px-3 bg-muted text-muted-foreground max-w-44 cursor-pointer hover:bg-accent hover:text-accent-foreground"
            >
              #<span className="truncate">{tag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Nostr links summary */}
      {showNostrLinks && parsedContent.nostrLinks.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-2">Nostr references:</h4>
          <div className="space-y-1">
            {parsedContent.nostrLinks.map((link, index) => (
              <div key={index} className="text-sm">
                <span className="font-mono text-blue-600">{link.type}:</span>{' '}
                <span className="font-mono">{link.id}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Highlight sources */}
      {showHighlightSources && parsedContent.highlightSources.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Highlight sources:</h4>
          <div className="space-y-3">
            {parsedContent.highlightSources.map((source, index) => (
              <HighlightSourcePreview
                key={index}
                source={source}
                className="w-full"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
