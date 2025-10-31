/**
 * Enhanced content component that uses the content parser service
 * while maintaining compatibility with existing embedded content
 */

import { useTranslatedEvent } from '@/hooks'
import {
  EmbeddedEmojiParser,
  EmbeddedEventParser,
  EmbeddedHashtagParser,
  EmbeddedLNInvoiceParser,
  EmbeddedMentionParser,
  EmbeddedUrlParser,
  EmbeddedWebsocketUrlParser,
  parseContent
} from '@/lib/content-parser'
import logger from '@/lib/logger'
import { getImetaInfosFromEvent } from '@/lib/event'
import { getEmojiInfosFromEmojiTags, getImetaInfoFromImetaTag, tagNameEquals } from '@/lib/tag'
import { cn } from '@/lib/utils'
import { cleanUrl, isImage, isMedia, isAudio, isVideo } from '@/lib/url'
import mediaUpload from '@/services/media-upload.service'
import { TImetaInfo } from '@/types'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import {
  EmbeddedHashtag,
  EmbeddedLNInvoice,
  EmbeddedMention,
  EmbeddedNormalUrl,
  EmbeddedNote,
  EmbeddedWebsocketUrl
} from '../Embedded'
import Emoji from '../Emoji'
import ImageGallery from '../ImageGallery'
import MediaPlayer from '../MediaPlayer'
import WebPreview from '../WebPreview'
import YoutubeEmbeddedPlayer from '../YoutubeEmbeddedPlayer'
import ParsedContent from './ParsedContent'

export default function EnhancedContent({
  event,
  content,
  className,
  mustLoadMedia,
  useEnhancedParsing = false
}: {
  event?: Event
  content?: string
  className?: string
  mustLoadMedia?: boolean
  useEnhancedParsing?: boolean
}) {
  const translatedEvent = useTranslatedEvent(event?.id)
  
  // If enhanced parsing is enabled and we have an event, use the new parser
  if (useEnhancedParsing && event) {
    return (
      <ParsedContent
        event={event}
        field="content"
        className={className}
        showMedia={true}
        showLinks={false}
        showHashtags={false}
        showNostrLinks={false}
      />
    )
  }

  // Fallback to original parsing logic
  const { nodes, allImages, lastNormalUrl, emojiInfos } = useMemo(() => {
    const _content = translatedEvent?.content ?? event?.content ?? content
    if (!_content) return {}

    const nodes = parseContent(_content, [
      EmbeddedUrlParser,
      EmbeddedLNInvoiceParser,
      EmbeddedWebsocketUrlParser,
      EmbeddedEventParser,
      EmbeddedMentionParser,
      EmbeddedHashtagParser,
      EmbeddedEmojiParser
    ])

    // Collect all images from multiple sources and deduplicate using cleaned URLs
    const seenUrls = new Set<string>()
    const allImages: TImetaInfo[] = []

    // Helper to add image/media if not already seen (using cleaned URL for comparison)
    const addImage = (url: string, pubkey?: string, mimeType?: string) => {
      if (!url) return
      const cleaned = cleanUrl(url)
      if (!cleaned || seenUrls.has(cleaned)) return
      
      // Only add if it's actually an image or media file
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      
      // Determine mime type if not provided
      let mime = mimeType
      if (!mime) {
        if (isImage(cleaned)) {
          mime = 'image/*'
        } else if (isAudio(cleaned)) {
          mime = 'audio/*'
        } else if (isVideo(cleaned)) {
          mime = 'video/*'
        } else {
          mime = 'media/*'
        }
      }
      
      allImages.push({
        url: cleaned,
        pubkey: pubkey || event?.pubkey,
        m: mime
      })
    }

    // 1. Extract from imeta tags
    if (event) {
      const imetaInfos = getImetaInfosFromEvent(event)
      imetaInfos.forEach((info) => {
        if (info.m?.startsWith('image/') || info.m?.startsWith('video/') || info.m?.startsWith('audio/') || isImage(info.url) || isMedia(info.url)) {
          addImage(info.url, info.pubkey, info.m)
        }
      })
    }

    // 2. Extract from r tags (reference/URL tags)
    if (event) {
      event.tags.filter(tagNameEquals('r')).forEach(([, url]) => {
        if (url && (isImage(url) || isMedia(url))) {
          addImage(url)
        }
      })
    }

    // 2b. Extract from image tag
    if (event) {
      const imageTag = event.tags.find(tag => tag[0] === 'image' && tag[1])
      if (imageTag?.[1]) {
        addImage(imageTag[1])
      }
    }

    // 3. Extract from content nodes (already parsed URLs)
    nodes.forEach((node) => {
      if (node.type === 'image') {
        addImage(node.data)
      } else if (node.type === 'images') {
        const urls = Array.isArray(node.data) ? node.data : [node.data]
        urls.forEach(url => addImage(url))
      } else if (node.type === 'url') {
        // Check if URL is an image/media file
        if (isImage(node.data) || isMedia(node.data)) {
          addImage(node.data)
        }
      }
    })

    // 4. Extract directly from raw content (catch any URLs that weren't parsed)
    // This ensures we don't miss any image URLs in the content
    if (_content) {
      const urlRegex = /https?:\/\/[^\s<>"']+/g
      const urlMatches = _content.matchAll(urlRegex)
      for (const match of urlMatches) {
        const url = match[0]
        if (isImage(url) || isMedia(url)) {
          addImage(url)
        }
      }
    }

    // 5. Try to match content URLs with imeta tags for better metadata
    if (event) {
      const imetaInfos = getImetaInfosFromEvent(event)
      allImages.forEach((img, index) => {
        // Try to find matching imeta info
        const matchedImeta = imetaInfos.find(imeta => cleanUrl(imeta.url) === img.url)
        if (matchedImeta && matchedImeta.m) {
          allImages[index] = { ...img, m: matchedImeta.m }
        } else {
          // Try to get imeta from media upload service
          const tag = mediaUpload.getImetaTagByUrl(img.url)
          if (tag) {
            const parsedImeta = getImetaInfoFromImetaTag(tag, event.pubkey)
            if (parsedImeta) {
              allImages[index] = parsedImeta
            }
          }
        }
      })
    }

    const emojiInfos = getEmojiInfosFromEmojiTags(event?.tags)

    const lastNormalUrlNode = nodes.findLast((node) => node.type === 'url')
    const lastNormalUrl =
      typeof lastNormalUrlNode?.data === 'string' ? cleanUrl(lastNormalUrlNode.data) : undefined

    return { nodes, allImages, emojiInfos, lastNormalUrl }
  }, [event, translatedEvent, content])

  if (!nodes || nodes.length === 0) {
    return null
  }

  // Create maps for quick lookup of images/media by cleaned URL
  const imageMap = new Map<string, TImetaInfo>()
  const mediaMap = new Map<string, TImetaInfo>()
  allImages.forEach((img) => {
    if (img.m?.startsWith('image/')) {
      imageMap.set(img.url, img)
    } else if (img.m?.startsWith('video/') || img.m?.startsWith('audio/') || img.m === 'media/*') {
      mediaMap.set(img.url, img)
    } else if (isImage(img.url)) {
      imageMap.set(img.url, img)
    } else if (isMedia(img.url)) {
      mediaMap.set(img.url, img)
    }
  })

  logger.debug('[EnhancedContent] Parsed content:', { 
    nodeCount: nodes.length, 
    allImages: allImages.length, 
    imageMapSize: imageMap.size,
    mediaMapSize: mediaMap.size,
    allImageUrls: allImages.map(img => img.url),
    nodes: nodes.map(n => ({ type: n.type, data: Array.isArray(n.data) ? n.data.length : n.data })) 
  })
  
  // Track which images/media have been rendered individually to prevent duplicates
  const renderedUrls = new Set<string>()
  
  // First pass: find which images/media appear in the content (will be rendered in a single carousel)
  const mediaInContent = new Set<string>()
  const imagesInContent: TImetaInfo[] = [] // Collect actual image info for carousel
  
  nodes.forEach((node) => {
    if (node.type === 'image') {
      const cleanedUrl = cleanUrl(node.data)
      mediaInContent.add(cleanedUrl)
      const imageInfo = imageMap.get(cleanedUrl) || { url: cleanedUrl, pubkey: event?.pubkey }
      if (!imagesInContent.find(img => img.url === cleanedUrl)) {
        imagesInContent.push(imageInfo)
      }
    } else if (node.type === 'images') {
      const urls = Array.isArray(node.data) ? node.data : [node.data]
      urls.forEach(url => {
        const cleaned = cleanUrl(url)
        mediaInContent.add(cleaned)
        const imageInfo = imageMap.get(cleaned) || { url: cleaned, pubkey: event?.pubkey }
        if (!imagesInContent.find(img => img.url === cleaned)) {
          imagesInContent.push(imageInfo)
        }
      })
    } else if (node.type === 'media') {
      mediaInContent.add(cleanUrl(node.data))
    } else if (node.type === 'url') {
      const cleanedUrl = cleanUrl(node.data)
      if (isImage(cleanedUrl)) {
        mediaInContent.add(cleanedUrl)
        const imageInfo = imageMap.get(cleanedUrl) || { url: cleanedUrl, pubkey: event?.pubkey }
        if (!imagesInContent.find(img => img.url === cleanedUrl)) {
          imagesInContent.push(imageInfo)
        }
      } else if (isMedia(cleanedUrl)) {
        mediaInContent.add(cleanedUrl)
      }
    }
  })
  
  // Filter carousel: only show IMAGES that DON'T appear in content
  // (videos and audio should never be in carousel - they're rendered individually)
  // (images in content will be rendered in a single carousel, not individually)
  const carouselImages = allImages.filter(img => {
    // Never include videos or audio in carousel
    if (isVideo(img.url) || isAudio(img.url) || img.m?.startsWith('video/') || img.m?.startsWith('audio/')) {
      return false
    }
    // Only include images that don't appear in content
    return !mediaInContent.has(img.url) && isImage(img.url)
  })

  return (
    <div className={cn('text-wrap break-words whitespace-pre-wrap', className)}>
      {/* Render images that appear in content in a single carousel at the top */}
      {imagesInContent.length > 0 && (
        <ImageGallery
          className="mt-2 mb-4"
          key="content-images-gallery"
          images={imagesInContent}
          start={0}
          end={imagesInContent.length}
          mustLoad={mustLoadMedia}
        />
      )}
      
      {/* Render images/media that aren't in content in a single carousel */}
      {carouselImages.length > 0 && (
        <ImageGallery
          className="mt-2 mb-4"
          key="all-images-gallery"
          images={carouselImages}
          start={0}
          end={carouselImages.length}
          mustLoad={mustLoadMedia}
        />
      )}
      
      {nodes.map((node, index) => {
        if (node.type === 'text') {
          return node.data
        }
        // Skip image nodes - they're rendered in the carousel at the top
        if (node.type === 'image' || node.type === 'images') {
          return null
        }
        // Render media individually in their content position (only once per URL)
        if (node.type === 'media') {
          const cleanedUrl = cleanUrl(node.data)
          // Skip if already rendered
          if (renderedUrls.has(cleanedUrl)) {
            return null
          }
          renderedUrls.add(cleanedUrl)
          return (
            <MediaPlayer 
              className="mt-2" 
              key={index} 
              src={cleanedUrl} 
              mustLoad={mustLoadMedia} 
            />
          )
        }
        if (node.type === 'url') {
          const cleanedUrl = cleanUrl(node.data)
          // Check if it's an image, video, or audio that should be rendered inline
          const isImageUrl = isImage(cleanedUrl)
          const isVideoUrl = isVideo(cleanedUrl)
          const isAudioUrl = isAudio(cleanedUrl)
          
          // Skip if already rendered (regardless of type)
          if (renderedUrls.has(cleanedUrl)) {
            return null
          }
          
          // Check video/audio first - never put them in ImageGallery
          if (isVideoUrl || isAudioUrl || mediaMap.has(cleanedUrl)) {
            renderedUrls.add(cleanedUrl)
            return (
              <MediaPlayer 
                className="mt-2" 
                key={`url-media-${index}`} 
                src={cleanedUrl} 
                mustLoad={mustLoadMedia} 
              />
            )
          }
          
          // Skip image URLs - they're rendered in the carousel at the top if they're in content
          // Only render if they're NOT in content (from r tags, etc.)
          if (isImageUrl) {
            // If it's in content, skip it (already in carousel)
            if (mediaInContent.has(cleanedUrl)) {
              return null
            }
            // Otherwise it's an image from r tags not in content, render it
            renderedUrls.add(cleanedUrl)
            const imageInfo = imageMap.get(cleanedUrl) || { url: cleanedUrl, pubkey: event?.pubkey }
            return (
              <ImageGallery
                className="mt-2"
                key={`url-img-${index}`}
                images={[imageInfo]}
                start={0}
                end={1}
                mustLoad={mustLoadMedia}
              />
            )
          }
          // Regular URL, not an image or media
          return <EmbeddedNormalUrl url={node.data} key={index} />
        }
        if (node.type === 'invoice') {
          return <EmbeddedLNInvoice invoice={node.data} key={index} className="mt-2" />
        }
        if (node.type === 'websocket-url') {
          return <EmbeddedWebsocketUrl url={node.data} key={index} />
        }
        if (node.type === 'event') {
          const id = node.data.split(':')[1]
          return <EmbeddedNote key={index} noteId={id} className="mt-2" />
        }
        if (node.type === 'mention') {
          return <EmbeddedMention key={index} userId={node.data.split(':')[1]} />
        }
        if (node.type === 'hashtag') {
          return <EmbeddedHashtag hashtag={node.data} key={index} />
        }
        if (node.type === 'emoji') {
          const shortcode = node.data.split(':')[1]
          const emoji = emojiInfos.find((e) => e.shortcode === shortcode)
          if (!emoji) return node.data
          return <Emoji classNames={{ img: 'mb-1' }} emoji={emoji} key={index} />
        }
        if (node.type === 'youtube') {
          return (
            <YoutubeEmbeddedPlayer
              key={index}
              url={node.data}
              className="mt-2"
              mustLoad={mustLoadMedia}
            />
          )
        }
        return null
      })}
      {lastNormalUrl && <WebPreview className="mt-2" url={lastNormalUrl} />}
    </div>
  )
}
