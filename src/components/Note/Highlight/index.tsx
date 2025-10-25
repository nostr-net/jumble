import { SecondaryPageLink } from '@/PageManager'
import { Event } from 'nostr-tools'
import { ExternalLink, Highlighter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { nip19 } from 'nostr-tools'
import { toNote } from '@/lib/link'

export default function Highlight({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { t } = useTranslation()
  
  try {

    // Extract the source (e-tag, a-tag, or r-tag) - simplified without useMemo
    let source = null
    const eTag = event.tags.find(tag => tag[0] === 'e')
    if (eTag) {
      const eventId = eTag[1]
      source = {
        type: 'event' as const,
        value: eventId,
        bech32: nip19.noteEncode(eventId)
      }
    } else {
      const aTag = event.tags.find(tag => tag[0] === 'a')
      if (aTag) {
        const [kind, pubkey, identifier] = aTag[1].split(':')
        const relay = aTag[2]
        source = {
          type: 'addressable' as const,
          value: aTag[1],
          bech32: nip19.naddrEncode({
            kind: parseInt(kind),
            pubkey,
            identifier: identifier || '',
            relays: relay ? [relay] : []
          })
        }
      } else {
        // First try to find r-tag with 'source' marker
        let rTag = event.tags.find(tag => tag[0] === 'r' && tag[2] === 'source')
        
        // If no r-tag with 'source' marker found, check if there's only one r-tag
        if (!rTag) {
          const rTags = event.tags.filter(tag => tag[0] === 'r')
          if (rTags.length === 1) {
            rTag = rTags[0]
          }
        }
        
        if (rTag) {
          source = {
            type: 'url' as const,
            value: rTag[1],
            bech32: rTag[1]
          }
        }
      }
    }

    // Extract the context (the main quote/full text being highlighted from)
    const contextTag = event.tags.find(tag => tag[0] === 'context')
    const context = contextTag?.[1] || event.content // Default to content if no context
    
    // The event.content is the highlighted portion
    const highlightedText = event.content

    return (
      <div className={`bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4 ${className || ''}`}>
        <div className="flex-1 min-w-0">
            {/* Full quoted text with highlighted portion */}
            {context && (
              <div className="text-base font-normal mb-3 whitespace-pre-wrap break-words">
                {contextTag && highlightedText ? (
                  // If we have both context and highlighted text, show the highlight within the context
                  <div>
                    {context.split(highlightedText).map((part, index) => (
                      <span key={index}>
                        {part}
                        {index < context.split(highlightedText).length - 1 && (
                          <mark className="bg-green-200 dark:bg-green-800 px-1 rounded">
                            {highlightedText}
                          </mark>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  // If no context tag, just show the content as a regular quote
                  <blockquote className="italic">
                    "{context}"
                  </blockquote>
                )}
              </div>
            )}

            {/* Source link */}
            {source && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span>{t('Source')}:</span>
                {source.type === 'url' ? (
                  <a
                    href={source.value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline flex items-center gap-1"
                  >
                    {source.value.length > 50 ? source.value.substring(0, 50) + '...' : source.value}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <SecondaryPageLink
                    to={toNote(source.bech32)}
                    className="text-blue-500 hover:underline font-mono"
                  >
                    {source.type === 'event' 
                      ? `note1${source.bech32.substring(5, 13)}...` 
                      : `naddr1${source.bech32.substring(6, 14)}...`
                    }
                  </SecondaryPageLink>
                )}
              </div>
            )}
          </div>
        </div>
    )
  } catch (error) {
    console.error('Highlight component error:', error)
    return (
      <div className={`relative border-l-4 border-red-500 bg-red-50/50 dark:bg-red-950/20 rounded-r-lg p-4 ${className || ''}`}>
        <div className="flex items-start gap-3">
          <Highlighter className="w-5 h-5 text-red-600 dark:text-red-500 shrink-0 mt-1" />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-red-800 dark:text-red-200">Highlight Error:</div>
            <div className="text-red-700 dark:text-red-300 text-sm">{String(error)}</div>
            <div className="mt-2 text-sm">Content: {event.content}</div>
            <div className="text-sm">Context: {event.tags.find(tag => tag[0] === 'context')?.[1] || 'No context found'}</div>
          </div>
        </div>
      </div>
    )
  }
}

