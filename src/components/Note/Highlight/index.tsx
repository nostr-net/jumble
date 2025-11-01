import { Event } from 'nostr-tools'
import { Highlighter } from 'lucide-react'
import { nip19 } from 'nostr-tools'
import HighlightSourcePreview from '@/components/UniversalContent/HighlightSourcePreview'

export default function Highlight({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  try {

    // Extract the source (e-tag, a-tag, or r-tag) with improved priority handling
    let source = null
    let sourceTag: string[] | undefined
    
    // Check for 'source' marker first (highest priority)
    for (const tag of event.tags) {
      if (tag[2] === 'source' || tag[3] === 'source') {
        sourceTag = tag
        break
      }
    }
    
    // If no 'source' marker found, process tags in priority order: e > a > r
    if (!sourceTag) {
      for (const tag of event.tags) {
        // Give 'e' tags highest priority
        if (tag[0] === 'e') {
          sourceTag = tag
          continue
        }
        
        // Give 'a' tags second priority (but don't override 'e' tags)
        if (tag[0] === 'a' && (!sourceTag || sourceTag[0] !== 'e')) {
          sourceTag = tag
          continue
        }
        
        // Give 'r' tags lowest priority
        if (tag[0] === 'r' && (!sourceTag || sourceTag[0] === 'r')) {
          sourceTag = tag
          continue
        }
      }
    }
    
    // Process the selected source tag
    if (sourceTag) {
      if (sourceTag[0] === 'e') {
        source = {
          type: 'event' as const,
          value: sourceTag[1],
          bech32: nip19.noteEncode(sourceTag[1])
        }
      } else if (sourceTag[0] === 'a') {
        const [kind, pubkey, identifier] = sourceTag[1].split(':')
        const relay = sourceTag[2]
        source = {
          type: 'addressable' as const,
          value: sourceTag[1],
          bech32: nip19.naddrEncode({
            kind: parseInt(kind),
            pubkey,
            identifier: identifier || '',
            relays: relay ? [relay] : []
          })
        }
      } else if (sourceTag[0] === 'r') {
        source = {
          type: 'url' as const,
          value: sourceTag[1],
          bech32: sourceTag[1]
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

            {/* Source preview card */}
            {source && (
              <div className="mt-3">
                <HighlightSourcePreview source={source} className="w-full" />
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

