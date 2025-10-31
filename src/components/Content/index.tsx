import { useTranslatedEvent, useMediaExtraction } from '@/hooks'
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
import { getEmojiInfosFromEmojiTags } from '@/lib/tag'
import { cn } from '@/lib/utils'
import { cleanUrl, isImage, isMedia, isAudio, isVideo } from '@/lib/url'
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
  const _content = translatedEvent?.content ?? event?.content ?? content
  
  // Use unified media extraction service
  const extractedMedia = useMediaExtraction(event, _content)
  
  const { nodes, lastNormalUrl, emojiInfos } = useMemo(() => {
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

    const emojiInfos = getEmojiInfosFromEmojiTags(event?.tags)

    const lastNormalUrlNode = nodes.findLast((node) => node.type === 'url')
    const lastNormalUrl =
      typeof lastNormalUrlNode?.data === 'string' ? cleanUrl(lastNormalUrlNode.data) : undefined

    return { nodes, emojiInfos, lastNormalUrl }
  }, [_content, event])

  if (!nodes || nodes.length === 0) {
    return null
  }

  // Create maps for quick lookup of images/media by cleaned URL
  const imageMap = new Map<string, TImetaInfo>()
  const mediaMap = new Map<string, TImetaInfo>()
  extractedMedia.all.forEach((img: TImetaInfo) => {
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

  // First pass: find which images appear in content (will be rendered in a single carousel)
  const mediaInContent = new Set<string>()
  const imagesInContent: TImetaInfo[] = []
  
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
  const carouselImages = extractedMedia.images.filter((img: TImetaInfo) => {
    return !mediaInContent.has(img.url)
  })

  logger.debug('[Content] Parsed content:', { 
    nodeCount: nodes.length, 
    allMedia: extractedMedia.all.length,
    images: extractedMedia.images.length,
    videos: extractedMedia.videos.length,
    audio: extractedMedia.audio.length,
    imageMapSize: imageMap.size, 
    mediaMapSize: mediaMap.size,
    nodes: nodes.map(n => ({ type: n.type, data: Array.isArray(n.data) ? n.data.length : n.data })) 
  })
  
  // Track which images/media have been rendered individually to prevent duplicates
  const renderedUrls = new Set<string>()
  
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
        // Render media individually in their content position
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
