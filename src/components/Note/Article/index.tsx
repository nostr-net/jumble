import { useSecondaryPage } from '@/PageManager'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import ImageGallery from '@/components/ImageGallery'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { ExternalLink } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import NostrNode from '../LongFormArticle/NostrNode'
import { remarkNostr } from '../LongFormArticle/remarkNostr'
import { Components } from '../LongFormArticle/types'
import { useEventFieldParser } from '@/hooks/useContentParser'
import WebPreview from '../../WebPreview'
import 'katex/dist/katex.min.css'

export default function Article({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { push } = useSecondaryPage()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  
  // Use the comprehensive content parser
  const { parsedContent, isLoading, error } = useEventFieldParser(event, 'content', {
    enableMath: true,
    enableSyntaxHighlighting: true
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
            className="max-h-[80vh] sm:max-h-[50vh] object-contain my-0 max-w-[400px]"
            classNames={{
              wrapper: 'w-fit max-w-[400px]'
            }}
          />
        )
      }) as Components,
    [event.pubkey]
  )

  if (isLoading) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div>Loading content...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div className="text-red-500">Error loading content: {error.message}</div>
      </div>
    )
  }

  if (!parsedContent) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div>No content available</div>
      </div>
    )
  }

  return (
    <div className={`${parsedContent.cssClasses} ${className || ''}`}>
      {/* Article metadata */}
      <h1 className="break-words">{metadata.title}</h1>
      {metadata.summary && (
        <blockquote>
          <p className="break-words">{metadata.summary}</p>
        </blockquote>
      )}
      {metadata.image && (
        <ImageWithLightbox
          image={{ url: metadata.image, pubkey: event.pubkey }}
          className="w-full max-w-[400px] aspect-[3/1] object-cover my-0"
        />
      )}


      {/* Render content based on markup type */}
      {parsedContent.markupType === 'asciidoc' ? (
        // AsciiDoc content (already processed to HTML)
        <div dangerouslySetInnerHTML={{ __html: parsedContent.html }} />
      ) : (
        // Markdown content (let react-markdown handle it)
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath, remarkNostr]}
          rehypePlugins={[rehypeKatex]}
          urlTransform={(url) => {
            if (url.startsWith('nostr:')) {
              return url.slice(6) // Remove 'nostr:' prefix for rendering
            }
            return url
          }}
          components={components}
        >
          {event.content}
        </Markdown>
      )}

      {/* Hashtags */}
      {parsedContent.hashtags.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2">
          {parsedContent.hashtags.map((tag) => (
            <div
              key={tag}
              title={tag}
              className="flex items-center rounded-full px-3 bg-muted text-muted-foreground max-w-44 cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => {
                e.stopPropagation()
                push(toNoteList({ hashtag: tag, kinds: [kinds.LongFormArticle] }))
              }}
            >
              #<span className="truncate">{tag}</span>
            </div>
          ))}
        </div>
      )}

      {/* Media thumbnails */}
      {parsedContent.media.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Images in this article:</h4>
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
      {parsedContent.links.length > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-lg">
          <h4 className="text-sm font-semibold mb-3">Links in this article:</h4>
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

      {/* Nostr links summary */}
      {parsedContent.nostrLinks.length > 0 && (
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