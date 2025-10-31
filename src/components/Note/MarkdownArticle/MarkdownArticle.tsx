import { SecondaryPageLink, useSecondaryPage } from '@/PageManager'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import ImageCarousel from '@/components/ImageCarousel/ImageCarousel'
import MediaPlayer from '@/components/MediaPlayer'
import Wikilink from '@/components/UniversalContent/Wikilink'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNote, toNoteList, toProfile } from '@/lib/link'
import { extractAllImagesFromEvent } from '@/lib/image-extraction'
import { getImetaInfosFromEvent } from '@/lib/event'
import { ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import React, { useMemo, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
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
  
  // Extract, normalize, and deduplicate all media URLs (images, audio, video)
  // from content, imeta tags, and image tags
  const mediaUrls = useMemo(() => {
    if (showImageGallery) return [] // Don't render inline for article content
    
    const seenUrls = new Set<string>()
    const mediaUrls: string[] = []
    
    // Helper to normalize and add URL
    const addUrl = (url: string) => {
      if (!url) return
      
      // Normalize URL by removing tracking parameters and cleaning it
      let normalizedUrl = url
        .replace(/[?&](utm_[^&]*)/g, '')
        .replace(/[?&](fbclid|gclid|msclkid)=[^&]*/g, '')
        .replace(/[?&]w=\d+/g, '')
        .replace(/[?&]h=\d+/g, '')
        .replace(/[?&]q=\d+/g, '')
        .replace(/[?&]f=\w+/g, '')
        .replace(/[?&]auto=\w+/g, '')
        .replace(/[?&]format=\w+/g, '')
        .replace(/[?&]fit=\w+/g, '')
        .replace(/[?&]crop=\w+/g, '')
        .replace(/[?&]&+/g, '&')
        .replace(/[?&]$/, '')
        .replace(/\?$/, '')
      
      try {
        // Validate URL
        const parsedUrl = new URL(normalizedUrl)
        const extension = parsedUrl.pathname.split('.').pop()?.toLowerCase()
        
        // Check if it's a media file
        const isMedia = 
          // Audio extensions
          (extension && ['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus', 'wma'].includes(extension)) ||
          // Video extensions
          (extension && ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'm4v', '3gp'].includes(extension)) ||
          // Image extensions
          (extension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'].includes(extension))
        
        if (isMedia && !seenUrls.has(normalizedUrl)) {
          mediaUrls.push(normalizedUrl)
          seenUrls.add(normalizedUrl)
        }
      } catch {
        // Invalid URL, skip
      }
    }
    
    // 1. Extract from content - all URLs (need to match exactly what markdown will find)
    const content = event.content || ''
    // Match URLs that could be in markdown links or plain text
    const urlMatches = content.match(/https?:\/\/[^\s<>"']+/g) || []
    urlMatches.forEach(url => {
      // Normalize the URL before adding
      const normalized = url.replace(/[?&](utm_[^&]*)/g, '')
        .replace(/[?&](fbclid|gclid|msclkid)=[^&]*/g, '')
        .replace(/[?&]w=\d+/g, '')
        .replace(/[?&]h=\d+/g, '')
        .replace(/[?&]q=\d+/g, '')
        .replace(/[?&]f=\w+/g, '')
        .replace(/[?&]auto=\w+/g, '')
        .replace(/[?&]format=\w+/g, '')
        .replace(/[?&]fit=\w+/g, '')
        .replace(/[?&]crop=\w+/g, '')
        .replace(/[?&]&+/g, '&')
        .replace(/[?&]$/, '')
        .replace(/\?$/, '')
      addUrl(normalized)
    })
    
    // 2. Extract from imeta tags
    const imetaInfos = getImetaInfosFromEvent(event)
    imetaInfos.forEach(info => addUrl(info.url))
    
    // 3. Extract from image tag
    const imageTag = event.tags.find(tag => tag[0] === 'image' && tag[1])
    if (imageTag?.[1]) {
      addUrl(imageTag[1])
    }
    
    return mediaUrls
  }, [event.content, event.tags, event.pubkey, showImageGallery])

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
          
          // Handle hashtag links (format: /notes?t=tag)
          if (href.startsWith('/notes?t=') || href.startsWith('notes?t=')) {
            // Normalize href to include leading slash if missing
            const normalizedHref = href.startsWith('/') ? href : `/${href}`
            return (
              <SecondaryPageLink
                to={normalizedHref}
                className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline"
              >
                {children}
              </SecondaryPageLink>
            )
          }
          
          // Handle wikilinks - only handle if href looks like a wikilink format
          // (we'll handle wikilinks in the text component below)
          
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
          
          // Check if this is a media URL that should be rendered inline (for non-article content)
          // If so, don't render it as a link - it will be rendered as inline media below
          if (!showImageGallery) {
            // Normalize the href to match the normalized mediaUrls
            const normalizedHref = href.replace(/[?&](utm_[^&]*)/g, '')
              .replace(/[?&](fbclid|gclid|msclkid)=[^&]*/g, '')
              .replace(/[?&]w=\d+/g, '')
              .replace(/[?&]h=\d+/g, '')
              .replace(/[?&]q=\d+/g, '')
              .replace(/[?&]f=\w+/g, '')
              .replace(/[?&]auto=\w+/g, '')
              .replace(/[?&]format=\w+/g, '')
              .replace(/[?&]fit=\w+/g, '')
              .replace(/[?&]crop=\w+/g, '')
              .replace(/[?&]&+/g, '&')
              .replace(/[?&]$/, '')
              .replace(/\?$/, '')
            
            if (mediaUrls.includes(normalizedHref)) {
              return null
            }
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
          if (typeof children !== 'string') {
            return <>{children}</>
          }
          
          // Handle hashtags and wikilinks
          const hashtagRegex = /#(\w+)/g
          const wikilinkRegex = /\[\[([^\]]+)\]\]/g
          const allMatches: Array<{index: number, end: number, type: 'hashtag' | 'wikilink', data: any}> = []
          
          let match
          while ((match = hashtagRegex.exec(children)) !== null) {
            allMatches.push({
              index: match.index,
              end: match.index + match[0].length,
              type: 'hashtag',
              data: match[1]
            })
          }
          
          while ((match = wikilinkRegex.exec(children)) !== null) {
            const content = match[1]
            let target = content.includes('|') ? content.split('|')[0].trim() : content.trim()
            let displayText = content.includes('|') ? content.split('|')[1].trim() : content.trim()
            
            if (content.startsWith('book:')) {
              target = content.replace('book:', '').trim()
            }
            
            const dtag = target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            
            allMatches.push({
              index: match.index,
              end: match.index + match[0].length,
              type: 'wikilink',
              data: { dtag, displayText }
            })
          }
          
          if (allMatches.length === 0) return <>{children}</>
          
          allMatches.sort((a, b) => a.index - b.index)
          
          const parts: (string | JSX.Element)[] = []
          let lastIndex = 0
          
          for (const match of allMatches) {
            if (match.index > lastIndex) {
              parts.push(children.slice(lastIndex, match.index))
            }
            
            if (match.type === 'hashtag') {
              parts.push(
                <SecondaryPageLink key={`h-${match.index}`} to={`/notes?t=${match.data.toLowerCase()}`} className="text-green-600 dark:text-green-400 hover:underline">
                  #{match.data}
                </SecondaryPageLink>
              )
            } else {
              parts.push(<Wikilink key={`w-${match.index}`} dTag={match.data.dtag} displayText={match.data.displayText} />)
            }
            
            lastIndex = match.end
          }
          
          if (lastIndex < children.length) {
            parts.push(children.slice(lastIndex))
          }
          
          return <>{parts}</>
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
    [showImageGallery, event.pubkey, mediaUrls, event.kind]
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
      <div className="break-words whitespace-pre-wrap">
        {event.content.split(/(#\w+|\[\[[^\]]+\]\])/).map((part, index, array) => {
          // Check if this part is a hashtag
          if (part.match(/^#\w+$/)) {
            const hashtag = part.slice(1)
            
            // Add spaces before and after unless at start/end of line
            const isStartOfLine = index === 0 || array[index - 1].match(/^[\s]*$/) !== null
            const isEndOfLine = index === array.length - 1 || array[index + 1].match(/^[\s]*$/) !== null
            
            const beforeSpace = isStartOfLine ? '' : ' '
            const afterSpace = isEndOfLine ? '' : ' '
            
            return (
              <span key={`hashtag-wrapper-${index}`}>
                {beforeSpace && beforeSpace}
                <a
                  href={`/notes?t=${hashtag.toLowerCase()}`}
                  className="text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const url = `/notes?t=${hashtag.toLowerCase()}`
                    console.log('[MarkdownArticle] Clicking hashtag, navigating to:', url)
                    push(url)
                  }}
                >
                  {part}
                </a>
                {afterSpace && afterSpace}
              </span>
            )
          }
          // Check if this part is a wikilink
          if (part.match(/^\[\[([^\]]+)\]\]$/)) {
            const content = part.slice(2, -2)
            let target = content.includes('|') ? content.split('|')[0].trim() : content.trim()
            let displayText = content.includes('|') ? content.split('|')[1].trim() : content.trim()
            
            if (content.startsWith('book:')) {
              target = content.replace('book:', '').trim()
            }
            
            const dtag = target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            
            return <Wikilink key={`wikilink-${index}`} dTag={dtag} displayText={displayText} />
          }
          // Regular text
          return <Markdown key={`text-${index}`} remarkPlugins={[remarkGfm, remarkMath, remarkNostr]} components={components}>{part}</Markdown>
        })}
      </div>
      
      {/* Inline Media - Show for non-article content (kinds 1, 11, 1111) */}
      {!showImageGallery && mediaUrls.length > 0 && (
        <div className="space-y-4 mt-4">
          {mediaUrls.map((url) => {
            const extension = url.split('.').pop()?.toLowerCase()
            
            // Images are already handled by the img component
            if (extension && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
              return null
            }
            
            // Render audio and video
            return (
              <MediaPlayer key={url} src={url} mustLoad={true} className="w-full" />
            )
          })}
        </div>
      )}
      
      {/* Image Carousel - Only show for article content (30023, 30041, 30817, 30818) */}
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
