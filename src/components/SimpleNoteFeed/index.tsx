import { forwardRef, useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { useNostr } from '@/providers/NostrProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { normalizeUrl } from '@/lib/url'
import { FAST_READ_RELAY_URLS } from '@/constants'
import client from '@/services/client.service'
import { Event } from 'nostr-tools'
import { kinds } from 'nostr-tools'
import logger from '@/lib/logger'
import NoteCard from '@/components/NoteCard'

type TSimpleNoteFeedProps = {
  authors?: string[]
  kinds?: number[]
  limit?: number
  hideReplies?: boolean
  filterMutedNotes?: boolean
  customHeader?: React.ReactNode
}

const SimpleNoteFeed = forwardRef<
  { refresh: () => void },
  TSimpleNoteFeedProps
>(({
  authors = [],
  kinds: requestedKinds = [kinds.ShortTextNote, kinds.Repost, kinds.Highlights, kinds.LongFormArticle],
  limit = 100,
  hideReplies = false,
  filterMutedNotes = false,
  customHeader
}, ref) => {
  const { t } = useTranslation()
  const { pubkey } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Build comprehensive relay list (same as Discussions)
  const buildComprehensiveRelayList = useCallback(async () => {
    const myRelayList = pubkey ? await client.fetchRelayList(pubkey) : { write: [], read: [] }
    const allRelays = [
      ...(myRelayList.read || []), // User's inboxes (kind 10002)
      ...(myRelayList.write || []), // User's outboxes (kind 10002)
      ...FAST_READ_RELAY_URLS,   // Fast read relays
    ]
    
    // Normalize and deduplicate relay URLs
    const normalizedRelays = allRelays
      .map(url => normalizeUrl(url))
      .filter((url): url is string => !!url)
    
    logger.debug('[SimpleNoteFeed] Using', normalizedRelays.length, 'comprehensive relays')
    return Array.from(new Set(normalizedRelays))
  }, [pubkey, favoriteRelays])

  // Fetch events using the same pattern as Discussions
  const fetchEvents = useCallback(async () => {
    if (isRefreshing) return
    setLoading(true)
    setIsRefreshing(true)
    
    try {
      console.log('🔄 [SimpleNoteFeed] Starting fetch...', { authors, kinds: requestedKinds, limit })
      logger.debug('[SimpleNoteFeed] Fetching events...', { authors, kinds: requestedKinds, limit })
      
      // Get comprehensive relay list
      const allRelays = await buildComprehensiveRelayList()
      console.log('📡 [SimpleNoteFeed] Using relays:', allRelays.length)
      
      // Build filter
      const filter: any = {
        kinds: requestedKinds,
        limit
      }
      
      if (authors.length > 0) {
        filter.authors = authors
      }
      
      console.log('🔍 [SimpleNoteFeed] Using filter:', filter)
      logger.debug('[SimpleNoteFeed] Using filter:', filter)
      
      // Fetch events
      console.log('⏳ [SimpleNoteFeed] Calling client.fetchEvents...')
      const fetchedEvents = await client.fetchEvents(allRelays, [filter])
      
      console.log('✅ [SimpleNoteFeed] Fetched', fetchedEvents.length, 'events')
      logger.debug('[SimpleNoteFeed] Fetched', fetchedEvents.length, 'events')
      
      // Deduplicate events by ID (same event might come from different relays)
      const seenIds = new Set<string>()
      const uniqueEvents = fetchedEvents.filter(event => {
        if (seenIds.has(event.id)) {
          return false
        }
        seenIds.add(event.id)
        return true
      })
      
      console.log('🔗 [SimpleNoteFeed] Deduplicated to', uniqueEvents.length, 'unique events')
      logger.debug('[SimpleNoteFeed] Deduplicated to', uniqueEvents.length, 'unique events')
      
      // Filter events (basic filtering)
      const filteredEvents = uniqueEvents.filter(event => {
        // Skip deleted events
        if (event.content === '') return false
        
        // Skip replies if hideReplies is true
        if (hideReplies && event.tags.some(tag => tag[0] === 'e' && tag[1])) {
          return false
        }
        
        return true
      })
      
      console.log('🎯 [SimpleNoteFeed] Filtered to', filteredEvents.length, 'events')
      logger.debug('[SimpleNoteFeed] Filtered to', filteredEvents.length, 'events')
      
      setEvents(filteredEvents)
    } catch (error) {
      console.error('❌ [SimpleNoteFeed] Error fetching events:', error)
      logger.error('[SimpleNoteFeed] Error fetching events:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [authors, requestedKinds, limit, hideReplies, buildComprehensiveRelayList, isRefreshing])

  // Initial fetch
  useEffect(() => {
    fetchEvents()
  }, [authors, requestedKinds, limit, hideReplies])

  // Expose refresh method
  useEffect(() => {
    if (ref && typeof ref === 'object') {
      ref.current = {
        refresh: fetchEvents
      }
    }
  }, [ref, fetchEvents])

  const handleRefresh = () => {
    fetchEvents()
  }

  if (loading && events.length === 0) {
    return (
      <div className="min-h-screen">
        {customHeader}
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-muted-foreground">{t('loading...')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {customHeader}
      
      {/* Refresh button */}
      <div className="flex justify-end p-4">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? t('refreshing...') : t('refresh')}
        </button>
      </div>

      {/* Events list */}
      {events.length > 0 ? (
        <div className="space-y-4">
          {events.map((event) => (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={filterMutedNotes}
            />
          ))}
        </div>
      ) : (
        <div className="flex justify-center w-full mt-8">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">{t('no notes found')}</p>
            <button
              onClick={handleRefresh}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              {t('reload notes')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

SimpleNoteFeed.displayName = 'SimpleNoteFeed'

export default SimpleNoteFeed
