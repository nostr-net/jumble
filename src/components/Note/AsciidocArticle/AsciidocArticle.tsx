import { useSecondaryPage, useSmartHashtagNavigation } from '@/PageManager'
import Image from '@/components/Image'
import MediaPlayer from '@/components/MediaPlayer'
import WebPreview from '@/components/WebPreview'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { useMediaExtraction } from '@/hooks'
import { cleanUrl, isImage, isMedia, isVideo, isAudio } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import { Event, kinds } from 'nostr-tools'
import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, Root } from 'react-dom/client'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { EmbeddedNote, EmbeddedMention } from '@/components/Embedded'
import Wikilink from '@/components/UniversalContent/Wikilink'
import { preprocessAsciidocMediaLinks } from '../MarkdownArticle/preprocessMarkup'
import logger from '@/lib/logger'

export default function AsciidocArticle({
  event,
  className,
  hideImagesAndInfo = false
}: {
  event: Event
  className?: string
  hideImagesAndInfo?: boolean
}) {
  const { push } = useSecondaryPage()
  const { navigateToHashtag } = useSmartHashtagNavigation()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  const contentRef = useRef<HTMLDivElement>(null)
  
  // Preprocess content to convert URLs to AsciiDoc syntax
  const processedContent = useMemo(() => {
    let content = preprocessAsciidocMediaLinks(event.content)
    
    // Convert "Read naddr... instead." patterns to AsciiDoc links
    const redirectRegex = /Read (naddr1[a-z0-9]+) instead\./gi
    content = content.replace(redirectRegex, (_match, naddr) => {
      return `Read link:/notes/${naddr}[${naddr}] instead.`
    })
    
    return content
  }, [event.content])
  
  // Extract all media from event
  const extractedMedia = useMediaExtraction(event, event.content)
  
  // Extract media from tags only (for display at top)
  const tagMedia = useMemo(() => {
    const seenUrls = new Set<string>()
    const media: Array<{ url: string; type: 'image' | 'video' | 'audio' }> = []
    
    // Extract from imeta tags
    const imetaInfos = getImetaInfosFromEvent(event)
    imetaInfos.forEach((info) => {
      const cleaned = cleanUrl(info.url)
      if (!cleaned || seenUrls.has(cleaned)) return
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      if (info.m?.startsWith('image/') || isImage(cleaned)) {
        media.push({ url: info.url, type: 'image' })
      } else if (info.m?.startsWith('video/') || isVideo(cleaned)) {
        media.push({ url: info.url, type: 'video' })
      } else if (info.m?.startsWith('audio/') || isAudio(cleaned)) {
        media.push({ url: info.url, type: 'audio' })
      }
    })
    
    // Extract from r tags
    event.tags.filter(tag => tag[0] === 'r' && tag[1]).forEach(tag => {
      const url = tag[1]
      const cleaned = cleanUrl(url)
      if (!cleaned || seenUrls.has(cleaned)) return
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      if (isImage(cleaned)) {
        media.push({ url, type: 'image' })
      } else if (isVideo(cleaned)) {
        media.push({ url, type: 'video' })
      } else if (isAudio(cleaned)) {
        media.push({ url, type: 'audio' })
      }
    })
    
    // Extract from image tag
    const imageTag = event.tags.find(tag => tag[0] === 'image' && tag[1])
    if (imageTag?.[1]) {
      const cleaned = cleanUrl(imageTag[1])
      if (cleaned && !seenUrls.has(cleaned) && isImage(cleaned)) {
        seenUrls.add(cleaned)
        media.push({ url: imageTag[1], type: 'image' })
      }
    }
    
    return media
  }, [event.id, JSON.stringify(event.tags)])
  
  // Extract non-media links from tags
  const tagLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    
    event.tags
      .filter(tag => tag[0] === 'r' && tag[1])
      .forEach(tag => {
        const url = tag[1]
        if (!url.startsWith('http://') && !url.startsWith('https://')) return
        if (isImage(url) || isMedia(url)) return
        
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      })
    
    return links
  }, [event.id, JSON.stringify(event.tags)])
  
  // Get all images for gallery (deduplicated)
  const allImages = useMemo(() => {
    const seenUrls = new Set<string>()
    const images: Array<{ url: string; alt?: string }> = []
    
    // Add images from extractedMedia
    extractedMedia.images.forEach(img => {
      const cleaned = cleanUrl(img.url)
      if (cleaned && !seenUrls.has(cleaned)) {
        seenUrls.add(cleaned)
        images.push({ url: img.url, alt: img.alt })
      }
    })
    
    // Add metadata image if it exists
    if (metadata.image) {
      const cleaned = cleanUrl(metadata.image)
      if (cleaned && !seenUrls.has(cleaned) && isImage(cleaned)) {
        seenUrls.add(cleaned)
        images.push({ url: metadata.image })
      }
    }
    
    return images
  }, [extractedMedia.images, metadata.image])
  
  // Create image index map for lightbox
  const imageIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    allImages.forEach((img, index) => {
      const cleaned = cleanUrl(img.url)
      if (cleaned) map.set(cleaned, index)
    })
    return map
  }, [allImages])
  
  // Parse content to find media URLs that are already rendered
  const mediaUrlsInContent = useMemo(() => {
    const urls = new Set<string>()
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    let match
    while ((match = urlRegex.exec(event.content)) !== null) {
      const url = match[0]
      const cleaned = cleanUrl(url)
      if (cleaned && (isImage(cleaned) || isVideo(cleaned) || isAudio(cleaned))) {
        urls.add(cleaned)
      }
    }
    return urls
  }, [event.content])
  
  // Extract non-media links from content
  const contentLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    let match
    while ((match = urlRegex.exec(event.content)) !== null) {
      const url = match[0]
      if ((url.startsWith('http://') || url.startsWith('https://')) && !isImage(url) && !isMedia(url)) {
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      }
    }
    return links
  }, [event.content])
  
  // Image gallery state
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
  }, [])
  
  // Filter tag media to only show what's not in content
  const leftoverTagMedia = useMemo(() => {
    const metadataImageUrl = metadata.image ? cleanUrl(metadata.image) : null
    return tagMedia.filter(media => {
      const cleaned = cleanUrl(media.url)
      if (!cleaned) return false
      // Skip if already in content
      if (mediaUrlsInContent.has(cleaned)) return false
      // Skip if this is the metadata image (shown separately)
      if (metadataImageUrl && cleaned === metadataImageUrl && !hideImagesAndInfo) return false
      return true
    })
  }, [tagMedia, mediaUrlsInContent, metadata.image, hideImagesAndInfo])
  
  // Parse AsciiDoc content and post-process for nostr: links and hashtags
  const [parsedHtml, setParsedHtml] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    let cancelled = false
    
    const parseAsciidoc = async () => {
      setIsLoading(true)
      try {
        const Asciidoctor = await import('@asciidoctor/core')
        const asciidoctor = Asciidoctor.default()
        
        if (cancelled) return
        
        const html = asciidoctor.convert(processedContent, {
          safe: 'safe',
          backend: 'html5',
          doctype: 'article',
          attributes: {
            'showtitle': true,
            'sectanchors': true,
            'sectlinks': true,
            'toc': 'left',
            'toclevels': 6,
            'toc-title': 'Table of Contents',
            'source-highlighter': 'highlight.js',
            'stem': 'latexmath',
            'data-uri': true,
            'imagesdir': '',
            'linkcss': false,
            'stylesheet': '',
            'stylesdir': '',
            'prewrap': true,
            'sectnums': false,
            'sectnumlevels': 6,
            'experimental': true,
            'compat-mode': false,
            'attribute-missing': 'warn',
            'attribute-undefined': 'warn',
            'skip-front-matter': true
          }
        })
        
        if (cancelled) return
        
        let htmlString = typeof html === 'string' ? html : html.toString()
        
        // Post-process HTML to handle nostr: links
        // Mentions (npub/nprofile) should be inline, events (note/nevent/naddr) should be block-level
        htmlString = htmlString.replace(/<a[^>]*href=["']nostr:([^"']+)["'][^>]*>(.*?)<\/a>/g, (_match, bech32Id) => {
          if (bech32Id.startsWith('npub') || bech32Id.startsWith('nprofile')) {
            return `<span data-nostr-mention="${bech32Id}" class="nostr-mention-placeholder"></span>`
          } else if (bech32Id.startsWith('note') || bech32Id.startsWith('nevent') || bech32Id.startsWith('naddr')) {
            return `<div data-nostr-note="${bech32Id}" class="nostr-note-placeholder"></div>`
          }
          return _match
        })
        
        // Also handle nostr: links in plain text (not in <a> tags)
        htmlString = htmlString.replace(/nostr:(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+|note1[a-z0-9]{58}|nevent1[a-z0-9]+|naddr1[a-z0-9]+)/g, (match, bech32Id) => {
          // Only replace if not already in a tag (basic check)
          if (!match.includes('<') && !match.includes('>')) {
            if (bech32Id.startsWith('npub') || bech32Id.startsWith('nprofile')) {
              return `<span data-nostr-mention="${bech32Id}" class="nostr-mention-placeholder"></span>`
            } else if (bech32Id.startsWith('note') || bech32Id.startsWith('nevent') || bech32Id.startsWith('naddr')) {
              return `<div data-nostr-note="${bech32Id}" class="nostr-note-placeholder"></div>`
            }
          }
          return match
        })
        
        // Handle wikilinks - convert passthrough markers to placeholders
        // AsciiDoc passthrough +++WIKILINK:link|display+++ outputs just WIKILINK:link|display in HTML
        // Match WIKILINK: followed by any characters (including |) until end of text or HTML tag
        htmlString = htmlString.replace(/WIKILINK:([^<>\s]+)/g, (_match, linkContent) => {
          // Escape special characters for HTML attributes
          const escaped = linkContent.replace(/"/g, '&quot;').replace(/'/g, '&#39;')
          return `<span data-wikilink="${escaped}" class="wikilink-placeholder"></span>`
        })
        
        setParsedHtml(htmlString)
      } catch (error) {
        logger.error('Failed to parse AsciiDoc', error as Error)
        setParsedHtml('<p>Error parsing AsciiDoc content</p>')
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    
    parseAsciidoc()
    
    return () => {
      cancelled = true
    }
  }, [processedContent])
  
  // Store React roots for cleanup
  const reactRootsRef = useRef<Map<Element, Root>>(new Map())
  
  // Post-process rendered HTML to inject React components for nostr: links and handle hashtags
  useEffect(() => {
    if (!contentRef.current || !parsedHtml || isLoading) return
    
    // Clean up previous roots
    reactRootsRef.current.forEach((root, element) => {
      root.unmount()
      reactRootsRef.current.delete(element)
    })
    
    // Process nostr: mentions - replace placeholders with React components (inline)
    const nostrMentions = contentRef.current.querySelectorAll('.nostr-mention-placeholder[data-nostr-mention]')
    nostrMentions.forEach((element) => {
      const bech32Id = element.getAttribute('data-nostr-mention')
      if (!bech32Id) return
      
      // Create an inline container for React component (mentions should be inline)
      const container = document.createElement('span')
      container.className = 'inline-block'
      element.parentNode?.replaceChild(container, element)
      
      // Use React to render the component
      const root = createRoot(container)
      root.render(<EmbeddedMention userId={bech32Id} />)
      reactRootsRef.current.set(container, root)
    })
    
    // Process nostr: notes - replace placeholders with React components
    const nostrNotes = contentRef.current.querySelectorAll('.nostr-note-placeholder[data-nostr-note]')
    nostrNotes.forEach((element) => {
      const bech32Id = element.getAttribute('data-nostr-note')
      if (!bech32Id) return
      
      // Create a block-level container for React component that fills width
      const container = document.createElement('div')
      container.className = 'w-full my-2'
      element.parentNode?.replaceChild(container, element)
      
      // Use React to render the component
      const root = createRoot(container)
      root.render(<EmbeddedNote noteId={bech32Id} />)
      reactRootsRef.current.set(container, root)
    })
    
    // Process wikilinks - replace placeholders with React components
    const wikilinks = contentRef.current.querySelectorAll('.wikilink-placeholder[data-wikilink]')
    wikilinks.forEach((element) => {
      const linkContent = element.getAttribute('data-wikilink')
      if (!linkContent) return
      
      // Parse wikilink: extract target and display text
      let target = linkContent.includes('|') ? linkContent.split('|')[0].trim() : linkContent.trim()
      let displayText = linkContent.includes('|') ? linkContent.split('|')[1].trim() : linkContent.trim()
      
      // Handle book: prefix
      if (linkContent.startsWith('book:')) {
        target = linkContent.replace('book:', '').trim()
      }
      
      // Convert to d-tag format (same as MarkdownArticle)
      const dtag = target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      
      // Create a container for React component
      const container = document.createElement('span')
      container.className = 'inline-block'
      element.parentNode?.replaceChild(container, element)
      
      // Use React to render the component
      const root = createRoot(container)
      root.render(<Wikilink dTag={dtag} displayText={displayText} />)
      reactRootsRef.current.set(container, root)
    })
    
    // Process hashtags in text nodes - convert #tag to links
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent is a link, code, or pre tag
          const parent = node.parentElement
          if (!parent) return NodeFilter.FILTER_ACCEPT
          if (parent.tagName === 'A' || parent.tagName === 'CODE' || parent.tagName === 'PRE') {
            return NodeFilter.FILTER_REJECT
          }
          return NodeFilter.FILTER_ACCEPT
        }
      }
    )
    
    const textNodes: Text[] = []
    let node
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        textNodes.push(node as Text)
      }
    }
    
    textNodes.forEach((textNode) => {
      const text = textNode.textContent || ''
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g
      const matches = Array.from(text.matchAll(hashtagRegex))
      
      if (matches.length > 0) {
        const fragment = document.createDocumentFragment()
        let lastIndex = 0
        
        matches.forEach((match) => {
          if (match.index === undefined) return
          
          // Add text before hashtag
          if (match.index > lastIndex) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)))
          }
          
          // Create hashtag link
          const link = document.createElement('a')
          link.href = `/notes?t=${match[1].toLowerCase()}`
          link.className = 'inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer'
          link.textContent = `#${match[1]}`
          link.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
            navigateToHashtag(`/notes?t=${match[1].toLowerCase()}`)
          })
          fragment.appendChild(link)
          
          lastIndex = match.index + match[0].length
        })
        
        // Add remaining text
        if (lastIndex < text.length) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex)))
        }
        
        textNode.parentNode?.replaceChild(fragment, textNode)
      }
    })
    
    // Cleanup function
    return () => {
      reactRootsRef.current.forEach((root) => {
        root.unmount()
      })
      reactRootsRef.current.clear()
    }
  }, [parsedHtml, isLoading, navigateToHashtag])
  
  // Initialize syntax highlighting
  useEffect(() => {
    const initHighlight = async () => {
      if (typeof window !== 'undefined') {
        const hljs = await import('highlight.js')
        if (contentRef.current) {
          contentRef.current.querySelectorAll('pre code').forEach((block) => {
            const element = block as HTMLElement
            element.style.color = 'inherit'
            element.classList.add('text-gray-900', 'dark:text-gray-100')
            hljs.default.highlightElement(element)
            element.style.color = 'inherit'
          })
        }
      }
    }
    
    const timeoutId = setTimeout(initHighlight, 100)
    return () => clearTimeout(timeoutId)
  }, [parsedHtml])
  
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
          color: #dc2626 !important;
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
          color: #0284c7 !important;
        }
        .hljs-comment,
        .hljs-quote {
          color: #6b7280 !important;
        }
        .hljs-number,
        .hljs-deletion {
          color: #0d9488 !important;
        }
        .dark .hljs-keyword,
        .dark .hljs-selector-tag,
        .dark .hljs-literal,
        .dark .hljs-title,
        .dark .hljs-section,
        .dark .hljs-doctag,
        .dark .hljs-type,
        .dark .hljs-name,
        .dark .hljs-strong {
          color: #f87171 !important;
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
          color: #38bdf8 !important;
        }
        .dark .hljs-comment,
        .dark .hljs-quote {
          color: #9ca3af !important;
        }
        .dark .hljs-number,
        .dark .hljs-deletion {
          color: #5eead4 !important;
        }
        .asciidoc-content img {
          max-width: 400px;
          height: auto;
          border-radius: 0.5rem;
          cursor: zoom-in;
        }
        .asciidoc-content a[href^="/notes?t="] {
          color: #16a34a !important;
          text-decoration: none !important;
        }
        .asciidoc-content a[href^="/notes?t="]:hover {
          color: #15803d !important;
          text-decoration: underline !important;
        }
        .dark .asciidoc-content a[href^="/notes?t="] {
          color: #4ade80 !important;
        }
        .dark .asciidoc-content a[href^="/notes?t="]:hover {
          color: #86efac !important;
        }
      `}</style>
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}>
        {/* Metadata */}
        {!hideImagesAndInfo && metadata.title && <h1 className="break-words">{metadata.title}</h1>}
        {!hideImagesAndInfo && metadata.summary && (
          <blockquote>
            <p className="break-words">{metadata.summary}</p>
          </blockquote>
        )}
        {hideImagesAndInfo && metadata.title && (
          <h2 className="text-2xl font-bold mb-4 leading-tight break-words">{metadata.title}</h2>
        )}
        
        {/* Metadata image */}
        {!hideImagesAndInfo && metadata.image && (() => {
          const cleanedMetadataImage = cleanUrl(metadata.image)
          // Don't show if already in content
          if (cleanedMetadataImage && mediaUrlsInContent.has(cleanedMetadataImage)) {
            return null
          }
          
          const metadataImageIndex = imageIndexMap.get(cleanedMetadataImage)
          
          return (
            <Image
              image={{ url: metadata.image, pubkey: event.pubkey }}
              className="max-w-[400px] w-full h-auto my-0 cursor-zoom-in"
              classNames={{
                wrapper: 'rounded-lg',
                errorPlaceholder: 'aspect-square h-[30vh]'
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (metadataImageIndex !== undefined) {
                  openLightbox(metadataImageIndex)
                }
              }}
            />
          )
        })()}
        
        {/* Media from tags (only if not in content) */}
        {leftoverTagMedia.length > 0 && (
          <div className="space-y-4 mb-6">
            {leftoverTagMedia.map((media) => {
              const cleaned = cleanUrl(media.url)
              const mediaIndex = imageIndexMap.get(cleaned)
              
              if (media.type === 'image') {
                return (
                  <div key={`tag-media-${cleaned}`} className="my-2">
                    <Image
                      image={{ url: media.url, pubkey: event.pubkey }}
                      className="max-w-[400px] rounded-lg cursor-zoom-in"
                      classNames={{
                        wrapper: 'rounded-lg',
                        errorPlaceholder: 'aspect-square h-[30vh]'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (mediaIndex !== undefined) {
                          openLightbox(mediaIndex)
                        }
                      }}
                    />
                  </div>
                )
              } else if (media.type === 'video' || media.type === 'audio') {
                return (
                  <div key={`tag-media-${cleaned}`} className="my-2">
                    <MediaPlayer
                      src={media.url}
                      className="max-w-[400px]"
                      mustLoad={true}
                    />
                  </div>
                )
              }
              return null
            })}
          </div>
        )}
        
        {/* Parsed AsciiDoc content */}
        {isLoading ? (
          <div>Loading content...</div>
        ) : (
          <div
            ref={contentRef}
            className="asciidoc-content break-words"
            dangerouslySetInnerHTML={{ __html: parsedHtml }}
          />
        )}
        
        {/* Hashtags from metadata */}
        {!hideImagesAndInfo && metadata.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap pb-2 mt-4">
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

        {/* WebPreview cards for links from content */}
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
      
      {/* Image gallery lightbox */}
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

