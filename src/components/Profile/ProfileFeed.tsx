import { FAST_READ_RELAY_URLS } from '@/constants'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useState, forwardRef, useImperativeHandle, useMemo } from 'react'
import NoteCard from '@/components/NoteCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'

interface ProfileFeedProps {
  pubkey: string
  topSpace?: number
  searchQuery?: string
}

const ProfileFeed = forwardRef<{ refresh: () => void }, ProfileFeedProps>(({ pubkey, topSpace, searchQuery = '' }, ref) => {
  console.log('[ProfileFeed] Component rendered with pubkey:', pubkey)
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
      
      console.log('[ProfileFeed] Comprehensive relay list:', uniqueRelays.length, 'relays')
      console.log('[ProfileFeed] User relays (read):', userRelayList.read?.length || 0)
      console.log('[ProfileFeed] User relays (write):', userRelayList.write?.length || 0)
      console.log('[ProfileFeed] Favorite relays:', favoriteRelays?.length || 0)
      
      return uniqueRelays
    } catch (error) {
      console.warn('[ProfileFeed] Error building relay list, using fallback:', error)
      return FAST_READ_RELAY_URLS
    }
  }, [pubkey, favoriteRelays])

  const fetchPosts = useCallback(async (isRetry = false, isRefresh = false) => {
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
      
      console.log('[ProfileFeed] Fetching events for pubkey:', pubkey, isRetry ? `(retry ${retryCount + 1}/${maxRetries})` : '')
      
      // Build comprehensive relay list including user's personal relays
      const comprehensiveRelays = await buildComprehensiveRelayList()
      console.log('[ProfileFeed] Using comprehensive relay list:', comprehensiveRelays.length, 'relays')
      
      // Now try to fetch text notes specifically
      const allEvents = await client.fetchEvents(comprehensiveRelays, {
        authors: [pubkey],
        kinds: [1], // Text notes only
        limit: 100
      })
      
      console.log('[ProfileFeed] Fetched total events:', allEvents.length)
      console.log('[ProfileFeed] Sample events:', allEvents.slice(0, 3).map(e => ({ id: e.id, content: e.content.substring(0, 50) + '...', tags: e.tags.slice(0, 3) })))
      
      // Show ALL events (both top-level posts and replies)
      console.log('[ProfileFeed] Showing all events (posts + replies):', allEvents.length)
      console.log('[ProfileFeed] Events sample:', allEvents.slice(0, 2).map(e => ({ id: e.id, content: e.content.substring(0, 50) + '...' })))
      
      const eventsToShow = allEvents
      
      // Sort by creation time (newest first)
      eventsToShow.sort((a, b) => b.created_at - a.created_at)
      
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
      console.error('[ProfileFeed] Error fetching events:', error)
      logger.component('ProfileFeed', 'Initialization failed', { pubkey, error: (error as Error).message, retryCount: isRetry ? retryCount + 1 : 0 })
      
      // If this is not a retry and we haven't exceeded max retries, schedule a retry
      if (!isRetry && retryCount < maxRetries) {
        console.log('[ProfileFeed] Scheduling retry', retryCount + 1, 'of', maxRetries)
        // Use shorter delays for initial retries, then exponential backoff
        const delay = retryCount === 0 ? 1000 : retryCount === 1 ? 2000 : 3000
        setTimeout(() => {
          setRetryCount(prev => prev + 1)
          fetchPosts(true)
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
    fetchPosts(false, true) // isRetry = false, isRefresh = true
  }, [fetchPosts])

  useImperativeHandle(ref, () => ({
    refresh
  }), [refresh])

  // Filter events based on search query
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) {
      return events
    }
    
    const query = searchQuery.toLowerCase()
    return events.filter(event => 
      event.content.toLowerCase().includes(query) ||
      event.tags.some(tag => 
        tag.length > 1 && tag[1]?.toLowerCase().includes(query)
      )
    )
  }, [events, searchQuery])

  // Separate effect for initial fetch only with a small delay
  useEffect(() => {
    if (pubkey) {
      // Add a small delay to let the component fully mount and relays to be ready
      const timer = setTimeout(() => {
        fetchPosts()
      }, 500) // 500ms delay
      
      return () => clearTimeout(timer)
    }
  }, [pubkey]) // Only depend on pubkey to avoid loops

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
        <div className="text-sm text-muted-foreground">No posts found</div>
      </div>
    )
  }

  if (filteredEvents.length === 0 && searchQuery.trim()) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="text-sm text-muted-foreground">No posts match your search</div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: topSpace || 0 }}>
      {isRefreshing && (
        <div className="px-4 py-2 text-sm text-green-500 text-center">
          🔄 Refreshing posts...
        </div>
      )}
      {searchQuery.trim() && (
        <div className="px-4 py-2 text-sm text-muted-foreground">
          {filteredEvents.length} of {events.length} posts
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

ProfileFeed.displayName = 'ProfileFeed'

export default ProfileFeed
