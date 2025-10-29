import { SecondaryPageLink, useSecondaryPage } from '@/PageManager'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import ImageCarousel from '@/components/ImageCarousel/ImageCarousel'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNote, toNoteList, toProfile } from '@/lib/link'
import { extractAllImagesFromEvent } from '@/lib/image-extraction'
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import React, { useMemo, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import NostrNode from './NostrNode'
import { remarkNostr } from './remarkNostr'
import { Components } from './types'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export default function MarkdownArticle({
  event,
  className,
  showImageGallery = false
}: {
  event: Event
  className?: string
  showImageGallery?: boolean
}) {
  const { push } = useSecondaryPage()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  const [isImagesOpen, setIsImagesOpen] = useState(false)
  
  // Extract all images from the event
  const allImages = useMemo(() => extractAllImagesFromEvent(event), [event])
  const contentRef = useRef<HTMLDivElement>(null)

  // Initialize highlight.js for syntax highlighting
  useEffect(() => {
    const initHighlight = async () => {
      if (typeof window !== 'undefined') {
        const hljs = await import('highlight.js')
        if (contentRef.current) {
          contentRef.current.querySelectorAll('pre code').forEach((block) => {
            // Ensure text color is visible before highlighting
            const element = block as HTMLElement
            element.style.color = 'inherit'
            element.classList.add('text-gray-900', 'dark:text-gray-100')
            hljs.default.highlightElement(element)
            // Ensure text color remains visible after highlighting
            element.style.color = 'inherit'
          })
        }
      }
    }
    
    // Run highlight after a short delay to ensure content is rendered
    const timeoutId = setTimeout(initHighlight, 100)
    return () => clearTimeout(timeoutId)
  }, [event.content])

  const components = useMemo(
    () =>
      ({
        nostr: ({ rawText, bech32Id }) => <NostrNode rawText={rawText} bech32Id={bech32Id} />,
        a: ({ href, children, ...props }) => {
          if (!href) {
            return <span {...props} className="break-words" />
          }
          if (href.startsWith('note1') || href.startsWith('nevent1') || href.startsWith('naddr1')) {
            return (
              <SecondaryPageLink
                to={toNote(href)}
                className="break-words underline text-foreground"
              >
                {children}
              </SecondaryPageLink>
            )
          }
          if (href.startsWith('npub1') || href.startsWith('nprofile1')) {
            return (
              <SecondaryPageLink
                to={toProfile(href)}
                className="break-words underline text-foreground"
              >
                {children}
              </SecondaryPageLink>
            )
          }
          return (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-words inline-flex items-baseline gap-1"
            >
              {children} <ExternalLink className="size-3" />
            </a>
          )
        },
        p: (props) => {
          // Check if the paragraph contains only an image
          const children = props.children
          if (React.Children.count(children) === 1 && React.isValidElement(children)) {
            const child = children as React.ReactElement
            if (child.type === ImageWithLightbox) {
              // Render image outside paragraph context
              return <div {...props} className="break-words" />
            }
          }
          return <p {...props} className="break-words" />
        },
        div: (props) => <div {...props} className="break-words" />,
        code: ({ className, children, ...props }: any) => {
          const match = /language-(\w+)/.exec(className || '')
          const isInline = !match
          return !isInline && match ? (
            <pre className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 overflow-x-auto">
              <code className={`language-${match[1]} ${className || ''} text-gray-900 dark:text-gray-100`} {...props}>
                {children}
              </code>
            </pre>
          ) : (
            <code className={`${className || ''} break-words whitespace-pre-wrap bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-gray-900 dark:text-gray-100`} {...props}>
              {children}
            </code>
          )
        },
        text: ({ children }) => {
          // Handle hashtags in text
          if (typeof children === 'string') {
            const hashtagRegex = /#(\w+)/g
            const parts = []
            let lastIndex = 0
            let match
            
            while ((match = hashtagRegex.exec(children)) !== null) {
              // Add text before the hashtag
              if (match.index > lastIndex) {
                parts.push(children.slice(lastIndex, match.index))
              }
              
              // Add the hashtag as a clickable link
              const hashtag = match[1]
              parts.push(
                <SecondaryPageLink
                  key={match.index}
                  to={toNoteList({ hashtag, kinds: [kinds.LongFormArticle] })}
                  className="text-green-600 dark:text-green-400 hover:underline"
                >
                  #{hashtag}
                </SecondaryPageLink>
              )
              
              lastIndex = match.index + match[0].length
            }
            
            // Add remaining text
            if (lastIndex < children.length) {
              parts.push(children.slice(lastIndex))
            }
            
            return <>{parts}</>
          }
          
          return <>{children}</>
        },
        img: ({ src }) => {
          if (!src) return null
          
          // If showing image gallery, don't render inline images - they'll be shown in the carousel
          if (showImageGallery) {
            return null
          }
          
          // For all other content, render images inline
          return (
            <ImageWithLightbox
              image={{ url: src, pubkey: event.pubkey }}
              className="max-w-full rounded-lg my-2"
            />
          )
        }
      }) as Components,
    [showImageGallery, event.pubkey]
  )

  return (
    <>
      <style>{`
        .hljs {
          background: transparent !important;
        }
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-literal,
        .hljs-title,
        .hljs-section,
        .hljs-doctag,
        .hljs-type,
        .hljs-name,
        .hljs-strong {
          color: #f85149 !important;
          font-weight: bold !important;
        }
        .hljs-string,
        .hljs-title.class_,
        .hljs-attr,
        .hljs-symbol,
        .hljs-bullet,
        .hljs-addition,
        .hljs-code,
        .hljs-regexp,
        .hljs-selector-pseudo,
        .hljs-selector-attr,
        .hljs-selector-class,
        .hljs-selector-id {
          color: #0366d6 !important;
        }
        .hljs-comment,
        .hljs-quote {
          color: #8b949e !important;
        }
        .hljs-number,
        .hljs-deletion {
          color: #005cc5 !important;
        }
        .hljs-variable,
        .hljs-template-variable,
        .hljs-link {
          color: #e36209 !important;
        }
        .hljs-meta {
          color: #6f42c1 !important;
        }
        .hljs-built_in,
        .hljs-class .hljs-title {
          color: #005cc5 !important;
        }
        .hljs-params {
          color: #f0f6fc !important;
        }
        .hljs-attribute {
          color: #005cc5 !important;
        }
        .hljs-function .hljs-title {
          color: #6f42c1 !important;
        }
        .hljs-subst {
          color: #f0f6fc !important;
        }
        .hljs-emphasis {
          font-style: italic;
        }
        .hljs-strong {
          font-weight: bold;
        }
      `}</style>
      <div
        ref={contentRef}
        className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}
      >
      {metadata.title && <h1 className="break-words">{metadata.title}</h1>}
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
      
      {/* Image Carousel - Only show for article content (30023, 30041, 30818) */}
      {showImageGallery && allImages.length > 0 && (
        <Collapsible open={isImagesOpen} onOpenChange={setIsImagesOpen} className="mt-8">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>Images in this article ({allImages.length})</span>
              {isImagesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <ImageCarousel images={allImages} />
          </CollapsibleContent>
        </Collapsible>
      )}
      {metadata.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2">
          {metadata.tags.map((tag) => (
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
      </div>
    </>
  )
}
