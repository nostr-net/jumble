import { SecondaryPageLink, useSecondaryPage, useSmartHashtagNavigation } from '@/PageManager'
import Image from '@/components/Image'
import MediaPlayer from '@/components/MediaPlayer'
import Wikilink from '@/components/UniversalContent/Wikilink'
import WebPreview from '@/components/WebPreview'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNote, toNoteList, toProfile } from '@/lib/link'
import { useMediaExtraction } from '@/hooks'
import { cleanUrl, isImage, isMedia, isVideo, isAudio } from '@/lib/url'
import { ExternalLink } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { ExtendedKind, URL_REGEX } from '@/constants'
import React, { useMemo, useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { createPortal } from 'react-dom'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import 'katex/dist/katex.min.css'
import NostrNode from './NostrNode'
import { remarkNostr } from './remarkNostr'
import { remarkHashtags } from './remarkHashtags'
import { remarkUnwrapImages } from './remarkUnwrapImages'
import { remarkUnwrapNostr } from './remarkUnwrapNostr'
import { preprocessMediaLinks } from './preprocessMediaLinks'
import { Components } from './types'

export default function MarkdownArticle({
  event,
  className,
  showImageGallery = false,
  hideMetadata = false
}: {
  event: Event
  className?: string
  showImageGallery?: boolean
  hideMetadata?: boolean
}) {
  const { push } = useSecondaryPage()
  const { navigateToHashtag } = useSmartHashtagNavigation()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  const contentRef = useRef<HTMLDivElement>(null)
  
  // Preprocess content to convert plain media URLs to markdown syntax
  // Also convert "Read naddr... instead." patterns to hyperlinks
  const processedContent = useMemo(() => {
    let content = preprocessMediaLinks(event.content)
    
    // Convert "Read naddr... instead." patterns to markdown links for replaceable events
    // This is a standard format for forwarding readers to referred events (e.g., in wikis)
    const redirectRegex = /Read (naddr1[a-z0-9]+) instead\./gi
    content = content.replace(redirectRegex, (_match, naddr) => {
      const href = toNote(naddr)
      return `Read [${naddr}](${href}) instead.`
    })
    
    return content
  }, [event.content])
  
  // Use unified media extraction service
  const extractedMedia = useMediaExtraction(event, event.content)
  
  // Extract hashtags that are actually present in the content (as literal #hashtag)
  // This ensures we only render green links for hashtags that are in the content, not from t-tags
  const contentHashtags = useMemo(() => {
    const hashtags = new Set<string>()
    const hashtagRegex = /#(\w+)/g
    let match
    while ((match = hashtagRegex.exec(event.content)) !== null) {
      hashtags.add(match[1].toLowerCase())
    }
    return hashtags
  }, [event.content])
  
  // Create a stable key for contentHashtags to prevent unnecessary re-renders
  const contentHashtagsKey = useMemo(() => {
    return Array.from(contentHashtags).sort().join(',')
  }, [contentHashtags])

  // Extract HTTP/HTTPS links from content (in order of appearance) for WebPreview cards at bottom
  const contentLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    
    // Extract markdown links: [text](url)
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
    let match
    while ((match = markdownLinkRegex.exec(event.content)) !== null) {
      const url = match[2]
      if ((url.startsWith('http://') || url.startsWith('https://')) && !isImage(url) && !isMedia(url)) {
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      }
    }
    
    // Extract raw URLs
    while ((match = URL_REGEX.exec(event.content)) !== null) {
      const url = match[0]
      if (!isImage(url) && !isMedia(url)) {
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      }
    }
    
    return links
  }, [event.content])

  // Extract HTTP/HTTPS links from r tags (excluding those already in content)
  const tagLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    
    // Create a set of content link URLs for quick lookup
    const contentLinkUrls = new Set(contentLinks)
    
    event.tags
      .filter(tag => tag[0] === 'r' && tag[1])
      .forEach(tag => {
        const url = tag[1]
        if ((url.startsWith('http://') || url.startsWith('https://')) && !isImage(url) && !isMedia(url)) {
          const cleaned = cleanUrl(url)
          // Only include if not already in content links and not already seen in tags
          if (cleaned && !contentLinkUrls.has(cleaned) && !seenUrls.has(cleaned)) {
            links.push(cleaned)
            seenUrls.add(cleaned)
          }
        }
      })
    
    return links
  }, [event.tags, contentLinks])
  
  // Extract media URLs that are in the content (so we don't render them twice)
  const mediaUrlsInContent = useMemo(() => {
    const urls = new Set<string>()
    const mediaUrlRegex = /(https?:\/\/[^\s<>"']+\.(jpg|jpeg|png|gif|webp|svg|heic|mp4|webm|ogg|mov|avi|wmv|flv|mkv|m4v|mp3|wav|flac|aac|m4a|opus|wma)(\?[^\s<>"']*)?)/gi
    let match
    while ((match = mediaUrlRegex.exec(event.content)) !== null) {
      urls.add(cleanUrl(match[0]))
    }
    return urls
  }, [event.content])
  
  // All images from useMediaExtraction are already cleaned and deduplicated
  // This includes images from content, tags, imeta, r tags, etc.
  // Memoize with stable key based on image URLs to prevent unnecessary re-renders
  const allImagesKey = useMemo(() => {
    return extractedMedia.images.map(img => img.url).sort().join(',')
  }, [extractedMedia.images])
  
  const allImages = useMemo(() => {
    return extractedMedia.images
  }, [allImagesKey])
  
  // Handle image clicks to open carousel
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  
  useEffect(() => {
    if (!contentRef.current || allImages.length === 0) return

    const handleImageClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'IMG' && target.hasAttribute('data-markdown-image')) {
        event.preventDefault()
        event.stopPropagation()
        
        const imageIndex = target.getAttribute('data-image-index')
        if (imageIndex !== null) {
          setLightboxIndex(parseInt(imageIndex, 10))
        }
      }
    }

    const contentElement = contentRef.current
    contentElement.addEventListener('click', handleImageClick)
    
    return () => {
      contentElement.removeEventListener('click', handleImageClick)
    }
  }, [allImages.length])

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
        nostr: ({ rawText, bech32Id }) => (
          <div data-nostr-node="true" className="my-2">
            <NostrNode rawText={rawText} bech32Id={bech32Id} />
          </div>
        ),
        a: ({ href, children, ...props }) => {
          if (!href) {
            return <span {...props} className="break-words" />
          }
          
          // Handle hashtag links (format: /notes?t=tag)
          if (href.startsWith('/notes?t=') || href.startsWith('notes?t=')) {
            // Normalize href to include leading slash if missing
            const normalizedHref = href.startsWith('/') ? href : `/${href}`
            // Render hashtags as inline green links - remarkHashtags only processes hashtags in content
            return (
              <span
                className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  navigateToHashtag(normalizedHref)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation()
                    e.preventDefault()
                    navigateToHashtag(normalizedHref)
                  }
                }}
                role="button"
                tabIndex={0}
              >
                {children}
              </span>
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
            
            // Check if this is a media URL that should be rendered inline
            // Videos and audio are handled separately below
            const extension = normalizedHref.split('.').pop()?.toLowerCase()
            if (extension && ['mp3', 'wav', 'flac', 'aac', 'm4a', 'opus', 'wma', 'mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'm4v', '3gp'].includes(extension)) {
              return null
            }
          }
          
          // If the link contains an image, handle it specially
          // When markdown processes [![](url)](link), it creates <a><img/></a>
          // The img component handler will convert <img> to <Image> component
          // So we check if children contains an Image component
          const hasImage = React.Children.toArray(children).some(
            child => React.isValidElement(child) && child.type === Image
          )
          
          // If link contains only an image, render just the image without the link wrapper
          // This prevents the image from opening as a file - clicking opens lightbox instead
          if (hasImage) {
            // Check if this is just an image with no other content
            const childrenArray = React.Children.toArray(children)
            const onlyImage = childrenArray.length === 1 && 
                             React.isValidElement(childrenArray[0]) && 
                             childrenArray[0].type === Image
            
            if (onlyImage) {
              // Just render the image directly, no link wrapper
              return <>{children}</>
            }
            
            // If there's text along with the image, keep the link wrapper
            // but prevent navigation when clicking the image itself
            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-block"
                onClick={(e) => {
                  // Only open link if not clicking directly on the image itself
                  // The image component will handle its own click for the lightbox
                  const target = e.target as HTMLElement
                  if (target.tagName === 'IMG' || target.closest('img')) {
                    // Prevent link navigation when clicking the image
                    // The image's onClick will handle opening the lightbox
                    e.preventDefault()
                    e.stopPropagation()
                    return
                  }
                  // Allow default link behavior for non-image clicks
                }}
              >
                {children}
              </a>
            )
          }
          
          // For regular HTTP/HTTPS URLs, render as green text link (like hashtags) instead of WebPreview
          // WebPreview cards will be shown at the bottom
          const cleanedHref = cleanUrl(href)
          const isRegularUrl = href.startsWith('http://') || href.startsWith('https://')
          
          if (isRegularUrl && !isImage(cleanedHref) && !isMedia(cleanedHref)) {
            return (
              <a
                {...props}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline"
              >
                {children}
              </a>
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
          // Check if the paragraph contains block-level elements that cannot be inside <p>
          // Convert to <div> to avoid DOM nesting warnings
          const children = props.children
          const childrenArray = React.Children.toArray(children)
          
          // Helper to check if a child is a block-level component
          const isBlockLevel = (child: React.ReactNode): boolean => {
            if (!React.isValidElement(child)) return false
            
            // Any div element is block-level and cannot be inside <p>
            if (child.type === 'div') {
              return true
            }
            
            // Check for known block-level components
            if (child.type === 'img' || 
                child.type === Image || 
                child.type === MediaPlayer || 
                child.type === NostrNode ||
                child.props?.['data-markdown-image'] ||
                child.props?.['data-markdown-image-wrapper'] ||
                child.props?.['data-nostr-node'] ||
                child.props?.['data-embedded-note']) {
              return true
            }
            
            // Check children recursively (up to 3 levels deep for nested structures like EmbeddedNote -> MarkdownArticle)
            if (child.props?.children) {
              const grandchildren = React.Children.toArray(child.props.children)
              if (grandchildren.some((gc: React.ReactNode) => isBlockLevel(gc))) {
                return true
              }
              // Check one more level deep
              for (const gc of grandchildren) {
                if (React.isValidElement(gc) && gc.props?.children) {
                  const greatGrandchildren = React.Children.toArray(gc.props.children)
                  if (greatGrandchildren.some((ggc: React.ReactNode) => isBlockLevel(ggc))) {
                    return true
                  }
                  // Check one more level for deeply nested structures
                  for (const ggc of greatGrandchildren) {
                    if (React.isValidElement(ggc) && ggc.props?.children) {
                      const greatGreatGrandchildren = React.Children.toArray(ggc.props.children)
                      if (greatGreatGrandchildren.some((gggc: React.ReactNode) => isBlockLevel(gggc))) {
                        return true
                      }
                    }
                  }
                }
              }
            }
            
            return false
          }
          
          // Check all children for block-level elements
          if (childrenArray.some(isBlockLevel)) {
            return <div {...props} className="break-words" />
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
          
          // Don't process hashtags in text component - they're already handled by split-based approach
          // Only handle wikilinks here
          const wikilinkRegex = /\[\[([^\]]+)\]\]/g
          const allMatches: Array<{index: number, end: number, type: 'wikilink', data: any}> = []
          
          let match
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
            
            parts.push(<Wikilink key={`w-${match.index}`} dTag={match.data.dtag} displayText={match.data.displayText} />)
            
            lastIndex = match.end
          }
          
          if (lastIndex < children.length) {
            parts.push(children.slice(lastIndex))
          }
          
          return <>{parts}</>
        },
        img: ({ src }) => {
          if (!src) return null
          
          const cleanedSrc = cleanUrl(src)
          
          // Check if this is actually a video or audio URL (converted by remarkMedia)
          if (cleanedSrc && (isVideo(cleanedSrc) || isAudio(cleanedSrc))) {
            // Wrap MediaPlayer in a div to ensure it's block-level and breaks out of paragraphs
            // Use stable key to prevent flickering
            const stableKey = cleanedSrc
            return (
              <div key={`media-wrapper-${stableKey}`} className="my-2">
                <MediaPlayer
                  key={`media-${stableKey}`}
                  src={cleanedSrc}
                  className="max-w-[400px]"
                  mustLoad={false}
                />
              </div>
            )
          }
          
          // Find the index of this image in allImages (includes content and tags, already deduplicated)
          const imageIndex = cleanedSrc 
            ? allImages.findIndex(img => cleanUrl(img.url) === cleanedSrc)
            : -1
          
          // Always render images inline in their content position
          // The shared lightbox will show all images (content + tags) when clicked
          // Wrap in div to ensure block-level rendering and prevent paragraph nesting
          // Use stable key based on cleaned URL to prevent flickering
          const stableKey = cleanedSrc || src
          return (
            <div key={`img-wrapper-${stableKey}`} className="my-2 inline-block" data-markdown-image-wrapper="true">
              <Image
                key={`img-${stableKey}`}
                image={{ url: src, pubkey: event.pubkey }}
                className="max-w-[400px] rounded-lg cursor-zoom-in"
                classNames={{
                  wrapper: 'rounded-lg inline-block',
                  errorPlaceholder: 'aspect-square h-[30vh]'
                }}
                data-markdown-image="true"
                data-image-index={imageIndex >= 0 ? imageIndex.toString() : undefined}
                onClick={(e) => {
                  e.stopPropagation()
                  if (imageIndex >= 0) {
                    setLightboxIndex(imageIndex)
                  }
                }}
              />
            </div>
          )
        }
      }) as Components,
    [showImageGallery, event.pubkey, event.kind, contentHashtagsKey, allImagesKey, navigateToHashtag]
  )

  return (
    <>
      <style>{`
        .hljs {
          background: transparent !important;
        }
        /* Light theme syntax highlighting */
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-literal,
        .hljs-title,
        .hljs-section,
        .hljs-doctag,
        .hljs-type,
        .hljs-name,
        .hljs-strong {
          color: #dc2626 !important; /* red-600 - good contrast on light */
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
          color: #0284c7 !important; /* sky-600 */
        }
        .hljs-comment,
        .hljs-quote {
          color: #6b7280 !important; /* gray-500 */
        }
        .hljs-number,
        .hljs-deletion {
          color: #0d9488 !important; /* teal-600 */
        }
        .hljs-variable,
        .hljs-template-variable,
        .hljs-link {
          color: #ea580c !important; /* orange-600 */
        }
        .hljs-meta {
          color: #7c3aed !important; /* violet-600 */
        }
        .hljs-built_in,
        .hljs-class .hljs-title {
          color: #0d9488 !important; /* teal-600 */
        }
        .hljs-params {
          color: #1f2937 !important; /* gray-800 */
        }
        .hljs-attribute {
          color: #0d9488 !important; /* teal-600 */
        }
        .hljs-function .hljs-title {
          color: #7c3aed !important; /* violet-600 */
        }
        .hljs-subst {
          color: #1f2937 !important; /* gray-800 */
        }
        
        /* Dark theme syntax highlighting */
        .dark .hljs-keyword,
        .dark .hljs-selector-tag,
        .dark .hljs-literal,
        .dark .hljs-title,
        .dark .hljs-section,
        .dark .hljs-doctag,
        .dark .hljs-type,
        .dark .hljs-name,
        .dark .hljs-strong {
          color: #f87171 !important; /* red-400 */
        }
        .dark .hljs-string,
        .dark .hljs-title.class_,
        .dark .hljs-attr,
        .dark .hljs-symbol,
        .dark .hljs-bullet,
        .dark .hljs-addition,
        .dark .hljs-code,
        .dark .hljs-regexp,
        .dark .hljs-selector-pseudo,
        .dark .hljs-selector-attr,
        .dark .hljs-selector-class,
        .dark .hljs-selector-id {
          color: #38bdf8 !important; /* sky-400 */
        }
        .dark .hljs-comment,
        .dark .hljs-quote {
          color: #9ca3af !important; /* gray-400 */
        }
        .dark .hljs-number,
        .dark .hljs-deletion {
          color: #5eead4 !important; /* teal-300 */
        }
        .dark .hljs-variable,
        .dark .hljs-template-variable,
        .dark .hljs-link {
          color: #fb923c !important; /* orange-400 */
        }
        .dark .hljs-meta {
          color: #a78bfa !important; /* violet-400 */
        }
        .dark .hljs-built_in,
        .dark .hljs-class .hljs-title {
          color: #5eead4 !important; /* teal-300 */
        }
        .dark .hljs-params {
          color: #e5e7eb !important; /* gray-200 */
        }
        .dark .hljs-attribute {
          color: #5eead4 !important; /* teal-300 */
        }
        .dark .hljs-function .hljs-title {
          color: #a78bfa !important; /* violet-400 */
        }
        .dark .hljs-subst {
          color: #e5e7eb !important; /* gray-200 */
        }
        
        .hljs-emphasis {
          font-style: italic;
        }
        .hljs-strong {
          font-weight: bold;
        }
        /* Force hashtag links to stay inline and green - override prose styles */
        .prose a[href^="/notes?t="],
        .prose a[href^="notes?t="],
        .prose span[role="button"][tabindex="0"] {
          display: inline !important;
          margin: 0 !important;
          padding: 0 !important;
          line-height: inherit !important;
          color: #16a34a !important; /* Tailwind green-600 */
          text-decoration: none !important;
        }
        .prose span[role="button"][tabindex="0"]:hover {
          color: #15803d !important; /* Tailwind green-700 */
          text-decoration: underline !important;
        }
        .dark .prose span[role="button"][tabindex="0"] {
          color: #4ade80 !important; /* Tailwind green-400 */
        }
        .dark .prose span[role="button"][tabindex="0"]:hover {
          color: #86efac !important; /* Tailwind green-300 */
          text-decoration: underline !important;
        }
        /* Make images display inline-block so they can wrap horizontally */
        .prose span[data-markdown-image] {
          display: inline-block !important;
          margin: 0.5rem !important;
        }
        /* When images are in paragraphs, make those paragraphs inline or flex */
        .prose p:has(span[data-markdown-image]:only-child) {
          display: inline-block;
          width: 100%;
        }
      `}</style>
              <div
                ref={contentRef}
                className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}
              >
                {!hideMetadata && metadata.title && <h1 className="break-words">{metadata.title}</h1>}
                {!hideMetadata && metadata.summary && (
                  <blockquote>
                    <p className="break-words">{metadata.summary}</p>
                  </blockquote>
                )}
                {/* Show title inline when metadata is hidden (for nested content) */}
                {/* Don't show title for discussions - it's already shown by the Note component */}
                {hideMetadata && metadata.title && event.kind !== ExtendedKind.DISCUSSION && (
                  <h2 className="text-2xl font-bold mb-4 leading-tight break-words">{metadata.title}</h2>
                )}
                {!hideMetadata && metadata.image && (() => {
        // Find the index of the metadata image in allImages
        const cleanedMetadataImage = cleanUrl(metadata.image)
        const metadataImageIndex = cleanedMetadataImage
          ? allImages.findIndex(img => cleanUrl(img.url) === cleanedMetadataImage)
          : -1
        
        return (
          <Image
            image={{ url: metadata.image, pubkey: event.pubkey }}
            className="max-w-[400px] w-full h-auto my-0 cursor-zoom-in"
            classNames={{
              wrapper: 'rounded-lg',
              errorPlaceholder: 'aspect-square h-[30vh]'
            }}
            data-markdown-image="true"
            data-image-index={metadataImageIndex >= 0 ? metadataImageIndex.toString() : undefined}
            onClick={(e) => {
              e.stopPropagation()
              if (metadataImageIndex >= 0) {
                setLightboxIndex(metadataImageIndex)
              }
            }}
          />
        )
      })()}
      <Markdown remarkPlugins={[remarkGfm, remarkMath, remarkUnwrapImages, remarkNostr, remarkUnwrapNostr, remarkHashtags]} components={components}>
        {processedContent}
      </Markdown>
      
      {/* Inline Media - Show for non-article content (kinds 1, 11, 1111) */}
      {/* Only render media that's not already in the content (from tags, imeta, etc.) */}
      {!showImageGallery && extractedMedia.videos.filter(v => !mediaUrlsInContent.has(v.url)).length > 0 && (
        <div className="space-y-4 mt-4">
          {extractedMedia.videos.filter(v => !mediaUrlsInContent.has(v.url)).map((video) => (
            <MediaPlayer key={video.url} src={video.url} mustLoad={true} className="w-full" />
          ))}
        </div>
      )}
      {!showImageGallery && extractedMedia.audio.filter(a => !mediaUrlsInContent.has(a.url)).length > 0 && (
        <div className="space-y-4 mt-4">
          {extractedMedia.audio.filter(a => !mediaUrlsInContent.has(a.url)).map((audio) => (
            <MediaPlayer key={audio.url} src={audio.url} mustLoad={true} className="w-full" />
          ))}
        </div>
      )}
      
      {metadata.tags.filter(tag => !contentHashtags.has(tag.toLowerCase())).length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2 mt-4">
          {metadata.tags
            .filter(tag => !contentHashtags.has(tag.toLowerCase()))
            .map((tag) => (
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

      {/* WebPreview cards for links from content (in order of appearance) */}
      {contentLinks.length > 0 && (
        <div className="space-y-3 mt-6 pt-4 border-t">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Links</h3>
          {contentLinks.map((url, index) => (
            <WebPreview key={`content-${index}-${url}`} url={url} className="w-full" />
          ))}
        </div>
      )}

      {/* WebPreview cards for links from tags */}
      {tagLinks.length > 0 && (
        <div className="space-y-3 mt-6 pt-4 border-t">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">Related Links</h3>
          {tagLinks.map((url, index) => (
            <WebPreview key={`tag-${index}-${url}`} url={url} className="w-full" />
          ))}
        </div>
      )}
      </div>
      
      {/* Image carousel lightbox - shows all images (content + tags), already cleaned and deduplicated */}
      {allImages.length > 0 && lightboxIndex >= 0 && createPortal(
        <div onClick={(e) => e.stopPropagation()}>
          <Lightbox
            index={lightboxIndex}
            slides={allImages.map(({ url, alt }) => ({ 
              src: url, 
              alt: alt || url 
            }))}
            plugins={[Zoom]}
            open={lightboxIndex >= 0}
            close={() => setLightboxIndex(-1)}
            controller={{
              closeOnBackdropClick: true,
              closeOnPullUp: true,
              closeOnPullDown: true
            }}
            styles={{
              toolbar: { paddingTop: '2.25rem' }
            }}
            carousel={{
              finite: false
            }}
          />
        </div>,
        document.body
      )}
    </>
  )
}
