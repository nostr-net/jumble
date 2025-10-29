/**
 * Component to display highlight sources (e/a tags or URLs) as embedded events or OpenGraph previews
 */

import { useMemo } from 'react'
import { nip19 } from 'nostr-tools'
import WebPreview from '../WebPreview'
import { EmbeddedNote } from '../Embedded/EmbeddedNote'
import { ExternalLink } from 'lucide-react'

interface HighlightSourcePreviewProps {
  source: {
    type: 'event' | 'addressable' | 'url'
    value: string
    bech32: string
  }
  className?: string
}

export default function HighlightSourcePreview({ source, className }: HighlightSourcePreviewProps) {
  const alexandriaUrl = useMemo(() => {
    if (source.type === 'url') {
      return source.value
    }
    return `https://next-alexandria.gitcitadel.eu/events?id=${source.bech32}`
  }, [source])

  if (source.type === 'event') {
    // For events, try to decode and show as embedded note
    try {
      const decoded = nip19.decode(source.bech32)
      if (decoded.type === 'nevent' || decoded.type === 'note') {
        return (
          <div className={className}>
            <EmbeddedNote noteId={source.value} className="w-full" />
          </div>
        )
      }
    } catch (error) {
      console.warn('Failed to decode nostr event:', error)
    }
  }

  if (source.type === 'addressable') {
    // For addressable events, try to decode and show as embedded note
    try {
      const decoded = nip19.decode(source.bech32)
      if (decoded.type === 'naddr') {
        return (
          <div className={className}>
            <EmbeddedNote noteId={source.bech32} className="w-full" />
          </div>
        )
      }
    } catch (error) {
      console.warn('Failed to decode nostr addressable event:', error)
    }
  }

  // Fallback: show as Alexandria link or WebPreview for URLs
  if (source.type === 'url') {
    return (
      <div className={className}>
        <WebPreview url={source.value} className="w-full" />
      </div>
    )
  }

  // For nostr events that couldn't be embedded, show as Alexandria link
  return (
    <div className={`p-3 border rounded-lg bg-muted/50 ${className}`}>
      <a
        href={alexandriaUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 break-words"
      >
        <span className="font-mono text-sm">
          {source.type === 'event' ? 'nevent' : 'naddr'}: {source.value.slice(0, 20)}...
        </span>
        <ExternalLink className="w-3 h-3 flex-shrink-0" />
      </a>
    </div>
  )
}
