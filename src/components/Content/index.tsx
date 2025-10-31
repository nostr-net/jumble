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
import { getEmojiInfosFromEmojiTags, getImetaInfoFromImetaTag } from '@/lib/tag'
import { cn } from '@/lib/utils'
import { cleanUrl, isImage, isMedia } from '@/lib/url'
import mediaUpload from '@/services/media-upload.service'
import { TImetaInfo } from '@/types'
import { Event } from 'nostr-tools'
import { tagNameEquals } from '@/lib/tag'
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

export default function Content({
  event,
  content,
  className,
  mustLoadMedia
}: {
  event?: Event
  content?: string
  className?: string
  mustLoadMedia?: boolean
}) {
  const translatedEvent = useTranslatedEvent(event?.id)
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

    // Helper to add image if not already seen (using cleaned URL for comparison)
    const addImage = (url: string, pubkey?: string, mimeType?: string) => {
      if (!url) return
      const cleaned = cleanUrl(url)
      if (!cleaned || seenUrls.has(cleaned)) return
      
      // Only add if it's actually an image or media file
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      allImages.push({
        url: cleaned,
        pubkey: pubkey || event?.pubkey,
        m: mimeType || (isImage(cleaned) ? 'image/*' : 'media/*')
      })
    }

    // 1. Extract from imeta tags
    if (event) {
      const imetaInfos = getImetaInfosFromEvent(event)
      imetaInfos.forEach((info) => {
        if (info.m?.startsWith('image/') || info.m?.startsWith('video/') || isImage(info.url) || isMedia(info.url)) {
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

  logger.debug('[Content] Parsed content:', { 
    nodeCount: nodes.length, 
    allImages: allImages.length, 
    imageMapSize: imageMap.size,
    mediaMapSize: mediaMap.size,
    allImageUrls: allImages.map(img => img.url),
    nodes: nodes.map(n => ({ type: n.type, data: Array.isArray(n.data) ? n.data.length : n.data })) 
  })
  
  return (
    <div className={cn('text-wrap break-words whitespace-pre-wrap', className)}>
      {/* Render all images/media once in a single carousel if we have any */}
      {allImages.length > 0 && (
        <ImageGallery
          className="mt-2 mb-4"
          key="all-images-gallery"
          images={allImages}
          start={0}
          end={allImages.length}
          mustLoad={mustLoadMedia}
        />
      )}
      
      {nodes.map((node, index) => {
        if (node.type === 'text') {
          return node.data
        }
        // Render images individually in their content position
        if (node.type === 'image') {
          const cleanedUrl = cleanUrl(node.data)
          const imageInfo = imageMap.get(cleanedUrl)
          logger.debug('[Content] Rendering image node:', { cleanedUrl, hasImageInfo: !!imageInfo, imageMapKeys: Array.from(imageMap.keys()) })
          // Always render, use imageInfo if available
          return (
            <ImageGallery
              className="mt-2"
              key={`img-${index}`}
              images={imageInfo ? [imageInfo] : [{ url: cleanedUrl, pubkey: event?.pubkey }]}
              start={0}
              end={1}
              mustLoad={mustLoadMedia}
            />
          )
        }
        if (node.type === 'images') {
          const urls = Array.isArray(node.data) ? node.data : [node.data]
          const imageInfos = urls
            .map(url => {
              const cleaned = cleanUrl(url)
              return imageMap.get(cleaned) || { url: cleaned, pubkey: event?.pubkey }
            })
            .filter(Boolean) as TImetaInfo[]
          if (imageInfos.length > 0) {
            return (
              <ImageGallery
                className="mt-2"
                key={`imgs-${index}`}
                images={imageInfos}
                start={0}
                end={imageInfos.length}
                mustLoad={mustLoadMedia}
              />
            )
          }
          return null
        }
        // Render media individually in their content position
        if (node.type === 'media') {
          const cleanedUrl = cleanUrl(node.data)
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
          // Check if it's an image or media that should be rendered inline
          // Also check if it's an image/media file even if not in our maps
          const isImageUrl = isImage(cleanedUrl)
          const isMediaUrl = isMedia(cleanedUrl)
          
          if (imageMap.has(cleanedUrl)) {
            const imageInfo = imageMap.get(cleanedUrl)!
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
          if (isImageUrl) {
            // It's an image URL but not in our map, render it anyway
            logger.debug('[Content] Rendering image URL node:', { cleanedUrl, isImageUrl })
            return (
              <ImageGallery
                className="mt-2"
                key={`url-img-${index}`}
                images={[{ url: cleanedUrl, pubkey: event?.pubkey }]}
                start={0}
                end={1}
                mustLoad={mustLoadMedia}
              />
            )
          }
          if (mediaMap.has(cleanedUrl)) {
            return (
              <MediaPlayer 
                className="mt-2" 
                key={`url-media-${index}`} 
                src={cleanedUrl} 
                mustLoad={mustLoadMedia} 
              />
            )
          }
          if (isMediaUrl) {
            // It's a media URL but not in our map, render it anyway
            return (
              <MediaPlayer 
                className="mt-2" 
                key={`url-media-${index}`} 
                src={cleanedUrl} 
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
