import { useMemo } from 'react'
import { cleanUrl, isImage } from '@/lib/url'
import ImageGallery from '../ImageGallery'
import { ExtractedMedia } from '@/services/media-extraction.service'
import { cn } from '@/lib/utils'

interface MediaRendererProps {
  extractedMedia: ExtractedMedia
  content?: string
  className?: string
  mustLoadMedia?: boolean
  /**
   * If true, render images that appear in content in a single carousel at the top
   * If false, render images individually where they appear in content
   */
  groupImagesInCarousel?: boolean
}

/**
 * Unified component for rendering media (images, videos, audio) from an event
 * Handles deduplication, carousel grouping, and proper component selection
 */
export default function MediaRenderer({
  extractedMedia,
  content,
  className,
  mustLoadMedia = false,
  groupImagesInCarousel = true
}: MediaRendererProps) {
  // Find which images appear in content (for carousel grouping)
  const imagesInContent = useMemo(() => {
    if (!content || !groupImagesInCarousel) return []
    
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    const urlMatches = content.matchAll(urlRegex)
    const imageUrls = new Set<string>()
    
    for (const match of urlMatches) {
      const url = match[0]
      const cleaned = cleanUrl(url)
      if (isImage(cleaned)) {
        imageUrls.add(cleaned)
      }
    }
    
    // Get image info for URLs that appear in content
    return extractedMedia.images.filter(img => imageUrls.has(img.url))
  }, [content, extractedMedia.images, groupImagesInCarousel])

  // Images from tags only (not in content) go in separate carousel
  const imagesFromTags = useMemo(() => {
    if (!content || !groupImagesInCarousel) return extractedMedia.images
    
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    const urlMatches = content.matchAll(urlRegex)
    const contentImageUrls = new Set<string>()
    
    for (const match of urlMatches) {
      const url = match[0]
      const cleaned = cleanUrl(url)
      if (isImage(cleaned)) {
        contentImageUrls.add(cleaned)
      }
    }
    
    return extractedMedia.images.filter(img => !contentImageUrls.has(img.url))
  }, [content, extractedMedia.images, groupImagesInCarousel])

  return (
    <div className={cn(className)}>
      {/* Render images from content in a single carousel at the top */}
      {groupImagesInCarousel && imagesInContent.length > 0 && (
        <ImageGallery
          className="mt-2 mb-4"
          key="content-images-gallery"
          images={imagesInContent}
          start={0}
          end={imagesInContent.length}
          mustLoad={mustLoadMedia}
        />
      )}

      {/* Render images from tags only (not in content) in a separate carousel */}
      {groupImagesInCarousel && imagesFromTags.length > 0 && (
        <ImageGallery
          className="mt-2 mb-4"
          key="tag-images-gallery"
          images={imagesFromTags}
          start={0}
          end={imagesFromTags.length}
          mustLoad={mustLoadMedia}
        />
      )}

      {/* Videos and audio should never be in carousel - they're rendered individually elsewhere */}
      {/* This component just provides the extracted media data */}
    </div>
  )
}

