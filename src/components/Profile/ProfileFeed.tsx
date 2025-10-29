import { FAST_READ_RELAY_URLS } from '@/constants'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import { Event } from 'nostr-tools'
import { useCallback, useEffect, useState } from 'react'
import NoteCard from '@/components/NoteCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'

interface ProfileFeedProps {
  pubkey: string
  topSpace?: number
}

export default function ProfileFeed({ pubkey, topSpace }: ProfileFeedProps) {
  console.log('[ProfileFeed] Component rendered with pubkey:', pubkey)
  const [events, setEvents] = useState<Event[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { favoriteRelays } = useFavoriteRelays()

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

  useEffect(() => {
    const fetchPosts = async () => {
      if (!pubkey) {
        setEvents([])
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        
        console.log('[ProfileFeed] Fetching events for pubkey:', pubkey)
        
        // Build comprehensive relay list including user's personal relays
        const comprehensiveRelays = await buildComprehensiveRelayList()
        console.log('[ProfileFeed] Using comprehensive relay list:', comprehensiveRelays.length, 'relays')
        
        // First, let's try to fetch ANY events from this user to see if they exist
        console.log('[ProfileFeed] Testing: fetching ANY events from this user...')
        const anyEvents = await client.fetchEvents(comprehensiveRelays.slice(0, 10), {
          authors: [pubkey],
          limit: 10
        })
        console.log('[ProfileFeed] Found ANY events:', anyEvents.length)
        if (anyEvents.length > 0) {
          console.log('[ProfileFeed] Sample ANY events:', anyEvents.map(e => ({ kind: e.kind, id: e.id, content: e.content?.substring(0, 30) + '...' })))
        }
        
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
        
        setEvents(eventsToShow)
      } catch (error) {
        console.error('[ProfileFeed] Error fetching events:', error)
        logger.component('ProfileFeed', 'Initialization failed', { pubkey, error: (error as Error).message })
        setEvents([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchPosts()
  }, [pubkey])

  if (isLoading) {
    return (
      <div className="space-y-2">
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

  return (
    <div style={{ marginTop: topSpace || 0 }}>
      <div className="space-y-2">
        {events.map((event) => (
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
}
