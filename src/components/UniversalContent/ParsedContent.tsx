/**
 * Universal content component that uses the content parser service
 * for all Nostr content fields
 */

import { useEventFieldParser } from '@/hooks/useContentParser'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Components } from '../Note/LongFormArticle/types'
import NostrNode from '../Note/LongFormArticle/NostrNode'
import ImageWithLightbox from '../ImageWithLightbox'
import ImageGallery from '../ImageGallery'
import { ExternalLink } from 'lucide-react'
import WebPreview from '../WebPreview'
import 'katex/dist/katex.min.css'

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
  maxImageWidth?: string
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
  maxImageWidth = '400px'
}: ParsedContentProps) {
  const { parsedContent, isLoading, error } = useEventFieldParser(event, field, {
    enableMath,
    enableSyntaxHighlighting
  })

  const components = useMemo(
    () =>
      ({
        nostr: ({ rawText, bech32Id }) => <NostrNode rawText={rawText} bech32Id={bech32Id} />,
        a: ({ href, children, ...props }) => {
          if (href?.startsWith('nostr:')) {
            return <NostrNode rawText={href} bech32Id={href.slice(6)} />
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words inline-flex items-baseline gap-1"
              {...props}
            >
              {children}
              <ExternalLink className="size-3" />
            </a>
          )
        },
        p: (props) => {
          // Check if paragraph contains only an image
          if (props.children && typeof props.children === 'string' && props.children.match(/^!\[.*\]\(.*\)$/)) {
            return <div {...props} />
          }
          return <p {...props} className="break-words" />
        },
        div: (props) => <div {...props} className="break-words" />,
        code: (props) => <code {...props} className="break-words whitespace-pre-wrap" />,
        img: (props) => (
          <ImageWithLightbox
            image={{ url: props.src || '', pubkey: event.pubkey }}
            className={`max-h-[80vh] sm:max-h-[50vh] object-contain my-0`}
            classNames={{
              wrapper: 'w-fit'
            }}
          />
        )
      }) as Components,
    [event.pubkey, maxImageWidth]
  )

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
      {/* Render content based on markup type */}
      {parsedContent.markupType === 'asciidoc' ? (
        // AsciiDoc content (already processed to HTML)
        <div dangerouslySetInnerHTML={{ __html: parsedContent.html }} />
      ) : (
        // Markdown content (let react-markdown handle it)
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={(url) => {
            if (url.startsWith('nostr:')) {
              return url.slice(6) // Remove 'nostr:' prefix for rendering
            }
            return url
          }}
          components={components}
        >
          {field === 'content' ? event.content : event.tags?.find(tag => tag[0] === field)?.[1] || ''}
        </Markdown>
      )}

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
    </div>
  )
}
