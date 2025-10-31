import { Skeleton } from '@/components/ui/skeleton'
import { useFetchEvent } from '@/hooks'
import { normalizeUrl } from '@/lib/url'
import { cn } from '@/lib/utils'
import client from '@/services/client.service'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Event, nip19 } from 'nostr-tools'
import ClientSelect from '../ClientSelect'
import MainNoteCard from '../NoteCard/MainNoteCard'
import { Button } from '../ui/button'
import { Search } from 'lucide-react'

export function EmbeddedNote({ noteId, className }: { noteId: string; className?: string }) {
  const { event, isFetching } = useFetchEvent(noteId)
  const [retryEvent, setRetryEvent] = useState<Event | undefined>(undefined)
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 3

  // If the first fetch fails, try a force retry (max 3 attempts)
  useEffect(() => {
    if (!isFetching && !event && !isRetrying && retryCount < maxRetries) {
      setIsRetrying(true)
      setRetryCount(prev => prev + 1)
      
      client.fetchEventForceRetry(noteId)
        .then((retryResult: any) => {
          if (retryResult) {
            setRetryEvent(retryResult)
          }
        })
        .catch((error: any) => {
          console.warn(`Retry ${retryCount + 1}/${maxRetries} failed for event:`, noteId, error)
        })
        .finally(() => {
          setIsRetrying(false)
        })
    }
  }, [isFetching, event, noteId, isRetrying, retryCount])

  const finalEvent = event || retryEvent
  const finalIsFetching = isFetching || (isRetrying && retryCount <= maxRetries)

  if (finalIsFetching) {
    return <EmbeddedNoteSkeleton className={className} />
  }

  if (!finalEvent) {
    return <EmbeddedNoteNotFound className={className} noteId={noteId} onEventFound={setRetryEvent} />
  }

  return (
    <div data-embedded-note onClick={(e) => e.stopPropagation()}>
      <MainNoteCard
        className={cn('w-full', className)}
        event={finalEvent}
        embedded
        originalNoteId={noteId}
      />
    </div>
  )
}

function EmbeddedNoteSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('text-left p-2 sm:p-3 border rounded-lg', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center space-x-2">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div>
          <Skeleton className="h-3 w-16 my-1" />
          <Skeleton className="h-3 w-16 my-1" />
        </div>
      </div>
      <Skeleton className="w-full h-4 my-1 mt-2" />
      <Skeleton className="w-2/3 h-4 my-1" />
    </div>
  )
}

function EmbeddedNoteNotFound({ 
  noteId, 
  className,
  onEventFound 
}: { 
  noteId: string
  className?: string
  onEventFound?: (event: Event) => void
}) {
  const { t } = useTranslation()
  const [isSearchingExternal, setIsSearchingExternal] = useState(false)
  const [triedExternal, setTriedExternal] = useState(false)
  const [externalRelays, setExternalRelays] = useState<string[]>([])

  // Calculate which external relays would be tried
  useEffect(() => {
    const getExternalRelays = async () => {
      let relays: string[] = []
      
      if (!/^[0-9a-f]{64}$/.test(noteId)) {
        try {
          const { type, data } = nip19.decode(noteId)
          
          if (type === 'nevent') {
            if (data.relays) relays.push(...data.relays)
            if (data.author) {
              const authorRelayList = await client.fetchRelayList(data.author)
              relays.push(...authorRelayList.write.slice(0, 6))
            }
          } else if (type === 'naddr') {
            if (data.relays) relays.push(...data.relays)
            const authorRelayList = await client.fetchRelayList(data.pubkey)
            relays.push(...authorRelayList.write.slice(0, 6))
          }
          // Normalize and deduplicate relays
          relays = relays.map(url => normalizeUrl(url) || url)
          relays = Array.from(new Set(relays))
        } catch (err) {
          console.error('Failed to parse external relays:', err)
        }
      }
      
      const seenOn = client.getSeenEventRelayUrls(noteId)
      relays.push(...seenOn)
      
      // Normalize and deduplicate final relay list
      const normalizedRelays = relays.map(url => normalizeUrl(url) || url)
      setExternalRelays(Array.from(new Set(normalizedRelays)))
    }

    getExternalRelays()
  }, [noteId])

  const handleTryExternalRelays = async () => {
    if (isSearchingExternal) return
    
    setIsSearchingExternal(true)
    try {
      const event = await client.fetchEventWithExternalRelays(noteId, [])
      if (event && onEventFound) {
        onEventFound(event)
      }
    } catch (error) {
      console.error('External relay fetch failed:', error)
    } finally {
      setIsSearchingExternal(false)
      setTriedExternal(true)
    }
  }

  const hasExternalRelays = externalRelays.length > 0

  return (
    <div className={cn('text-left p-3 border rounded-lg', className)}>
      <div className="flex flex-col items-center text-muted-foreground gap-3">
        <div className="text-sm font-medium">{t('Note not found')}</div>
        
        {!triedExternal && hasExternalRelays && (
          <div className="flex flex-col items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTryExternalRelays}
              disabled={isSearchingExternal}
              className="gap-2 w-full"
            >
              {isSearchingExternal ? (
                <>
                  <Search className="w-4 h-4 animate-spin" />
                  {t('Searching...')}
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  {t('Try external relays')} ({externalRelays.length})
                </>
              )}
            </Button>
            <details className="text-xs text-muted-foreground w-full">
              <summary className="cursor-pointer hover:text-foreground text-center list-none">
                {t('Show relays')}
              </summary>
              <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
                {externalRelays.map((relay, i) => (
                  <div key={i} className="font-mono text-[10px] truncate px-2 py-0.5 bg-muted/50 rounded">
                    {relay}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
        
        {!triedExternal && !hasExternalRelays && (
          <p className="text-xs text-center">{t('No external relay hints available')}</p>
        )}
        
        {triedExternal && (
          <p className="text-xs text-center">{t('Note could not be found anywhere')}</p>
        )}
        
        <ClientSelect className="w-full" originalNoteId={noteId} />
      </div>
    </div>
  )
}
