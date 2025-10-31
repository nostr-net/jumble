import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { extractAllMediaFromEvent, ExtractedMedia } from '@/services/media-extraction.service'

/**
 * Hook to extract all media from an event
 */
export function useMediaExtraction(
  event?: Event,
  content?: string
): ExtractedMedia {
  return useMemo(() => {
    if (!event) {
      return { images: [], videos: [], audio: [], all: [] }
    }
    return extractAllMediaFromEvent(event, content)
  }, [event, content])
}

