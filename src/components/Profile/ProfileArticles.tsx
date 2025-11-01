import { ExtendedKind, FAST_READ_RELAY_URLS } from '@/constants'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import { Event, kinds } from 'nostr-tools'
import { useCallback, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react'
import NoteCard from '@/components/NoteCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'

interface ProfileArticlesProps {
  pubkey: string
  topSpace?: number
  searchQuery?: string
  kindFilter?: string
  onEventsChange?: (events: Event[]) => void
}

const ProfileArticles = forwardRef<{ refresh: () => void; getEvents: () => Event[] }, ProfileArticlesProps>(({ pubkey, topSpace, searchQuery = '', kindFilter = 'all', onEventsChange }, ref) => {
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { favoriteRelays } = useFavoriteRelays()
  const maxRetries = 3

  // Build comprehensive relay list including user's personal relays
  const buildComprehensiveRelayList = useCallback(async () => {
    try {
      // Get user's relay list (kind 10002)
      const userRelayList = await client.fetchRelayList(pubkey)
      
      // Get all relays: user's + fast read + favorite relays
      const allRelays = [
        ...(userRelayList.read || []), // User's read relays
        ...(userRelayList.write || []), // User's write relays  
        ...FAST_READ_RELAY_URLS, // Fast read relays
        ...(favoriteRelays || []) // User's favorite relays
      ]
      
      // Normalize URLs and remove duplicates
      const normalizedRelays = allRelays
        .map(url => normalizeUrl(url))
        .filter((url): url is string => !!url)
      
      const uniqueRelays = Array.from(new Set(normalizedRelays))
      
      return uniqueRelays
    } catch (error) {
      return FAST_READ_RELAY_URLS
    }
  }, [pubkey, favoriteRelays])

  const fetchArticles = useCallback(async (isRetry = false, isRefresh = false) => {
    if (!pubkey) {
      setEvents([])
      setIsLoading(false)
      return
    }

    try {
      if (!isRetry && !isRefresh) {
        setIsLoading(true)
        setRetryCount(0)
      } else if (isRetry) {
        setIsRetrying(true)
      } else if (isRefresh) {
        setIsRefreshing(true)
      }
      
      // Build comprehensive relay list including user's personal relays
      const comprehensiveRelays = await buildComprehensiveRelayList()
      
      // Fetch longform articles (kind 30023), wiki articles (kinds 30817, 30818), publications (kind 30040), and highlights (kind 9802)
      const allEvents = await client.fetchEvents(comprehensiveRelays, {
        authors: [pubkey],
        kinds: [kinds.LongFormArticle, 30817, 30818, 30040, kinds.Highlights], // LongFormArticle, WikiArticle (markdown), WikiArticle (asciidoc), Publication, and Highlights
        limit: 100
      })
      
      const eventsToShow = allEvents
      
      // Sort by creation time (newest first)
      eventsToShow.sort((a, b) => b.created_at - a.created_at)
      
      // If initial load returns 0 events but it's not a retry, wait and retry once
      // This handles cases where relays return "too many concurrent REQS" and return empty results
      if (!isRetry && !isRefresh && eventsToShow.length === 0 && retryCount === 0) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          fetchArticles(true)
        }, 2000) // Wait 2 seconds before retry to let relays recover
        return
      }
      
      if (isRefresh) {
        // For refresh, append new events and deduplicate
        setEvents(prevEvents => {
          const existingIds = new Set(prevEvents.map(e => e.id))
          const newEvents = eventsToShow.filter(event => !existingIds.has(event.id))
          const combinedEvents = [...newEvents, ...prevEvents]
          // Re-sort the combined events
          return combinedEvents.sort((a, b) => b.created_at - a.created_at)
        })
      } else {
        // For initial load or retry, replace events
        setEvents(eventsToShow)
      }
      
      // Reset retry count on successful fetch
      if (isRetry) {
        setRetryCount(0)
      }
    } catch (error) {
      console.error('[ProfileArticles] Error fetching events:', error)
      logger.component('ProfileArticles', 'Initialization failed', { pubkey, error: (error as Error).message, retryCount: isRetry ? retryCount + 1 : 0 })
      
      // If this is not a retry and we haven't exceeded max retries, schedule a retry
      if (!isRetry && retryCount < maxRetries) {
        // Use shorter delays for initial retries, then exponential backoff
        const delay = retryCount === 0 ? 1000 : retryCount === 1 ? 2000 : 3000
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          fetchArticles(true)
        }, delay)
      } else {
        setEvents([])
      }
    } finally {
      setIsLoading(false)
      setIsRetrying(false)
      setIsRefreshing(false)
    }
  }, [pubkey, buildComprehensiveRelayList, maxRetries])

  // Expose refresh function to parent component
  const refresh = useCallback(() => {
    setRetryCount(0)
    setIsRefreshing(true)
    fetchArticles(false, true) // isRetry = false, isRefresh = true
  }, [fetchArticles])

  useImperativeHandle(ref, () => ({
    refresh,
    getEvents: () => events
  }), [refresh, events])

  // Notify parent of events changes
  useEffect(() => {
    if (onEventsChange) {
      onEventsChange(events)
    }
  }, [events, onEventsChange])

  // Filter events based on search query and kind filter
  const filteredEvents = useMemo(() => {
    let filtered = events

    // Filter by kind first
    if (kindFilter && kindFilter !== 'all') {
      const kindFilterNum = parseInt(kindFilter)
      if (!isNaN(kindFilterNum)) {
        filtered = filtered.filter(event => event.kind === kindFilterNum)
      }
    }

    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(event => 
        event.content.toLowerCase().includes(query) ||
        event.tags.some(tag => 
          tag.length > 1 && tag[1]?.toLowerCase().includes(query)
        )
      )
    }

    return filtered
  }, [events, searchQuery, kindFilter])

  // Separate effect for initial fetch only with a small delay
  // Separate effect for initial fetch only - delay slightly to avoid race conditions with other tabs
  useEffect(() => {
    if (pubkey) {
      // Small delay to stagger initial fetches across tabs and allow relay list cache to populate
      const timeoutId = setTimeout(() => {
        fetchArticles()
      }, 150) // 150ms delay (slightly longer than posts) to allow previous fetches to populate cache
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]) // Only depend on pubkey - fetchArticles is stable from useCallback

  if (isLoading || isRetrying) {
    return (
      <div className="space-y-2">
        {isRetrying && retryCount > 0 && (
          <div className="text-center py-2 text-sm text-muted-foreground">
            Retrying... ({retryCount}/{maxRetries})
          </div>
        )}
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  if (!pubkey) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-sm text-muted-foreground">No profile selected</div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-sm text-muted-foreground">No articles, publications, or highlights found</div>
      </div>
    )
  }

  // Get kind label for display
  const getKindLabel = (kindValue: string) => {
    if (!kindValue || kindValue === 'all') return 'articles, publications, or highlights'
    const kindNum = parseInt(kindValue)
    if (kindNum === kinds.LongFormArticle) return 'long form articles'
    if (kindNum === ExtendedKind.WIKI_ARTICLE_MARKDOWN) return 'wiki articles (markdown)'
    if (kindNum === ExtendedKind.WIKI_ARTICLE) return 'wiki articles (asciidoc)'
    if (kindNum === ExtendedKind.PUBLICATION) return 'publications'
    if (kindNum === kinds.Highlights) return 'highlights'
    return 'items'
  }

  if (filteredEvents.length === 0 && (searchQuery.trim() || (kindFilter && kindFilter !== 'all'))) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-sm text-muted-foreground">
          {searchQuery.trim() 
            ? `No ${getKindLabel(kindFilter)} match your search`
            : `No ${getKindLabel(kindFilter)} found`}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: topSpace || 0 }}>
      {isRefreshing && (
        <div className="px-4 py-2 text-sm text-green-500 text-center">
          🔄 Refreshing articles...
        </div>
      )}
      {(searchQuery.trim() || (kindFilter && kindFilter !== 'all')) && (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          {filteredEvents.length} of {events.length} {getKindLabel(kindFilter)}
        </div>
      )}
      <div className="space-y-2">
        {filteredEvents.map((event) => (
          <NoteCard
            key={event.id}
            className="w-full"
            event={event}
            filterMutedNotes={false}
          />
        ))}
      </div>
    </div>
  )
})

ProfileArticles.displayName = 'ProfileArticles'

export default ProfileArticles
