import { useSecondaryPage, useSmartHashtagNavigation } from '@/PageManager'
import Image from '@/components/Image'
import MediaPlayer from '@/components/MediaPlayer'
import Wikilink from '@/components/UniversalContent/Wikilink'
import WebPreview from '@/components/WebPreview'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { useMediaExtraction } from '@/hooks'
import { cleanUrl, isImage, isMedia, isVideo, isAudio } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import { Event, kinds } from 'nostr-tools'
import { ExtendedKind } from '@/constants'
import React, { useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { EmbeddedNote, EmbeddedMention } from '@/components/Embedded'
import { preprocessMarkdownMediaLinks } from './preprocessMarkup'

/**
 * Parse markdown content and render with post-processing for nostr: links and hashtags
 * Post-processes:
 * - nostr: links -> EmbeddedNote or EmbeddedMention
 * - #hashtags -> green hyperlinks to /notes?t=hashtag
 */
function parseMarkdownContent(
  content: string,
  options: {
    eventPubkey: string
    imageIndexMap: Map<string, number>
    openLightbox: (index: number) => void
    navigateToHashtag: (href: string) => void
  }
): React.ReactNode[] {
  const { eventPubkey, imageIndexMap, openLightbox, navigateToHashtag } = options
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  
  // Find all patterns: markdown images, markdown links, nostr addresses, hashtags, wikilinks
  const patterns: Array<{ index: number; end: number; type: string; data: any }> = []
  
  // Markdown images: ![](url) or ![alt](url)
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const imageMatches = Array.from(content.matchAll(markdownImageRegex))
  imageMatches.forEach(match => {
    if (match.index !== undefined) {
      patterns.push({
        index: match.index,
        end: match.index + match[0].length,
        type: 'markdown-image',
        data: { alt: match[1], url: match[2] }
      })
    }
  })
  
  // Markdown links: [text](url) - but not images
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const linkMatches = Array.from(content.matchAll(markdownLinkRegex))
  linkMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if this is already an image
      const isImage = content.substring(Math.max(0, match.index - 1), match.index) === '!'
      if (!isImage) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'markdown-link',
          data: { text: match[1], url: match[2] }
        })
      }
    }
  })
  
  // Nostr addresses (nostr:npub1..., nostr:note1..., etc.) - not in markdown links
  const nostrRegex = /nostr:(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+|note1[a-z0-9]{58}|nevent1[a-z0-9]+|naddr1[a-z0-9]+)/g
  const nostrMatches = Array.from(content.matchAll(nostrRegex))
  nostrMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by a markdown link/image
      const isInMarkdown = patterns.some(p => 
        (p.type === 'markdown-link' || p.type === 'markdown-image') && 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInMarkdown) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'nostr',
          data: match[1]
        })
      }
    }
  })
  
  // Hashtags (#tag) - but not inside markdown links or nostr addresses
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g
  const hashtagMatches = Array.from(content.matchAll(hashtagRegex))
  hashtagMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by another pattern
      const isInOther = patterns.some(p => 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'hashtag',
          data: match[1]
        })
      }
    }
  })
  
  // Wikilinks ([[link]] or [[link|display]])
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g
  const wikilinkMatches = Array.from(content.matchAll(wikilinkRegex))
  wikilinkMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by another pattern
      const isInOther = patterns.some(p => 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'wikilink',
          data: match[1]
        })
      }
    }
  })
  
  // Sort patterns by index
  patterns.sort((a, b) => a.index - b.index)
  
  // Remove overlapping patterns (keep the first one)
  const filteredPatterns: typeof patterns = []
  let lastEnd = 0
  patterns.forEach(pattern => {
    if (pattern.index >= lastEnd) {
      filteredPatterns.push(pattern)
      lastEnd = pattern.end
    }
  })
  
  // Build React nodes from patterns
  filteredPatterns.forEach((pattern, i) => {
    // Add text before pattern
    if (pattern.index > lastIndex) {
      const text = content.slice(lastIndex, pattern.index)
      if (text) {
        parts.push(<span key={`text-${i}`}>{text}</span>)
      }
    }
    
    // Render pattern
    if (pattern.type === 'markdown-image') {
      const { url } = pattern.data
      const cleaned = cleanUrl(url)
      const imageIndex = imageIndexMap.get(cleaned)
      if (isImage(cleaned)) {
        parts.push(
          <div key={`img-${i}`} className="my-2 inline-block">
            <Image
              image={{ url, pubkey: eventPubkey }}
              className="max-w-[400px] rounded-lg cursor-zoom-in"
              classNames={{
                wrapper: 'rounded-lg inline-block',
                errorPlaceholder: 'aspect-square h-[30vh]'
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (imageIndex !== undefined) {
                  openLightbox(imageIndex)
                }
              }}
            />
          </div>
        )
      } else if (isVideo(cleaned) || isAudio(cleaned)) {
        parts.push(
          <div key={`media-${i}`} className="my-2">
            <MediaPlayer
              src={cleaned}
              className="max-w-[400px]"
              mustLoad={false}
            />
          </div>
        )
      }
    } else if (pattern.type === 'markdown-link') {
      const { text, url } = pattern.data
      // Render as green link (will show WebPreview at bottom for HTTP/HTTPS)
      parts.push(
        <a
          key={`link-${i}`}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline break-words"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </a>
      )
    } else if (pattern.type === 'nostr') {
      const bech32Id = pattern.data
      // Check if it's a profile type (mentions/handles should be inline)
      if (bech32Id.startsWith('npub') || bech32Id.startsWith('nprofile')) {
        parts.push(
          <span key={`nostr-${i}`} className="inline-block">
            <EmbeddedMention userId={bech32Id} />
          </span>
        )
      } else if (bech32Id.startsWith('note') || bech32Id.startsWith('nevent') || bech32Id.startsWith('naddr')) {
        // Embedded events should be block-level and fill width
        parts.push(
          <div key={`nostr-${i}`} className="w-full my-2">
            <EmbeddedNote noteId={bech32Id} />
          </div>
        )
      } else {
        parts.push(<span key={`nostr-${i}`}>nostr:{bech32Id}</span>)
      }
    } else if (pattern.type === 'hashtag') {
      const tag = pattern.data
      parts.push(
        <a
          key={`hashtag-${i}`}
          href={`/notes?t=${tag.toLowerCase()}`}
          className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            navigateToHashtag(`/notes?t=${tag.toLowerCase()}`)
          }}
        >
          #{tag}
        </a>
      )
    } else if (pattern.type === 'wikilink') {
      const linkContent = pattern.data
      let target = linkContent.includes('|') ? linkContent.split('|')[0].trim() : linkContent.trim()
      let displayText = linkContent.includes('|') ? linkContent.split('|')[1].trim() : linkContent.trim()
      
      if (linkContent.startsWith('book:')) {
        target = linkContent.replace('book:', '').trim()
      }
      
      const dtag = target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      
      parts.push(
        <Wikilink key={`wikilink-${i}`} dTag={dtag} displayText={displayText} />
      )
    }
    
    lastIndex = pattern.end
  })
  
  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text) {
      parts.push(<span key="text-end">{text}</span>)
    }
  }
  
  // If no patterns, just return the content as text
  if (parts.length === 0) {
    return [<span key="text-only">{content}</span>]
  }
  
  return parts
}

export default function MarkdownArticle({
  event,
  className,
  hideMetadata = false
}: {
  event: Event
  className?: string
  hideMetadata?: boolean
}) {
  const { push } = useSecondaryPage()
  const { navigateToHashtag } = useSmartHashtagNavigation()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  
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
      if (metadataImageUrl && cleaned === metadataImageUrl && !hideMetadata) return false
      return true
    })
  }, [tagMedia, mediaUrlsInContent, metadata.image, hideMetadata])
  
  // Preprocess content to convert URLs to markdown syntax
  const preprocessedContent = useMemo(() => {
    return preprocessMarkdownMediaLinks(event.content)
  }, [event.content])
  
  // Parse markdown content with post-processing for nostr: links and hashtags
  const parsedContent = useMemo(() => {
    return parseMarkdownContent(preprocessedContent, {
      eventPubkey: event.pubkey,
      imageIndexMap,
      openLightbox,
      navigateToHashtag
    })
  }, [preprocessedContent, event.pubkey, imageIndexMap, openLightbox, navigateToHashtag])
  
  return (
    <>
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}>
        {/* Metadata */}
        {!hideMetadata && metadata.title && <h1 className="break-words">{metadata.title}</h1>}
        {!hideMetadata && metadata.summary && (
          <blockquote>
            <p className="break-words">{metadata.summary}</p>
          </blockquote>
        )}
        {hideMetadata && metadata.title && event.kind !== ExtendedKind.DISCUSSION && (
          <h2 className="text-2xl font-bold mb-4 leading-tight break-words">{metadata.title}</h2>
        )}
        
        {/* Metadata image */}
        {!hideMetadata && metadata.image && (() => {
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
        
        {/* Parsed content */}
        <div className="break-words whitespace-pre-wrap">
          {parsedContent}
        </div>
        
        {/* Hashtags from metadata */}
        {metadata.tags.length > 0 && (
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
