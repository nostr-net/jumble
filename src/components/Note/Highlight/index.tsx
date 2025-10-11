import { SecondaryPageLink } from '@/PageManager'
import { Event } from 'nostr-tools'
import { ExternalLink, Highlighter } from 'lucide-react'
import { useMemo } from 'react'
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

  // Extract the source (e-tag, a-tag, or r-tag)
  const source = useMemo(() => {
    const eTag = event.tags.find(tag => tag[0] === 'e')
    if (eTag) {
      const eventId = eTag[1]
      return {
        type: 'event' as const,
        value: eventId,
        bech32: nip19.noteEncode(eventId)
      }
    }

    const aTag = event.tags.find(tag => tag[0] === 'a')
    if (aTag) {
      const [kind, pubkey, identifier] = aTag[1].split(':')
      const relay = aTag[2]
      return {
        type: 'addressable' as const,
        value: aTag[1],
        bech32: nip19.naddrEncode({
          kind: parseInt(kind),
          pubkey,
          identifier: identifier || '',
          relays: relay ? [relay] : []
        })
      }
    }

    const rTag = event.tags.find(tag => tag[0] === 'r' && tag[2] === 'source')
    if (rTag) {
      return {
        type: 'url' as const,
        value: rTag[1],
        bech32: rTag[1]
      }
    }

    return null
  }, [event.tags])

  // Extract the context (optional comment/surrounding context)
  const context = useMemo(() => {
    const contextTag = event.tags.find(tag => tag[0] === 'context')
    return contextTag?.[1] || ''
  }, [event.tags])

  return (
    <div className={`relative border-l-4 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20 rounded-r-lg p-4 ${className || ''}`}>
      <div className="flex items-start gap-3">
        <Highlighter className="w-5 h-5 text-yellow-600 dark:text-yellow-500 shrink-0 mt-1" />
        <div className="flex-1 min-w-0">
          {/* Highlighted text */}
          {event.content && (
            <blockquote className="text-base font-normal mb-3 whitespace-pre-wrap break-words italic">
              "{event.content}"
            </blockquote>
          )}

          {/* Context (user's comment or surrounding context) - rendered as plaintext */}
          {context && (
            <div className="text-sm text-muted-foreground bg-background/50 rounded p-2 mb-3 whitespace-pre-wrap break-words">
              {context}
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
    </div>
  )
}

