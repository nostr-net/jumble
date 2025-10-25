import NoteCard, { NoteCardLoadingSkeleton } from '@/components/NoteCard'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import client from '@/services/client.service'
import { NostrEvent } from 'nostr-tools'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNostr } from '@/providers/NostrProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import noteStatsService from '@/services/note-stats.service'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'

const SHOW_COUNT = 10
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

// Unified cache for all custom trending feeds
let cachedCustomEvents: {
  events: Array<{ event: NostrEvent; score: number }>
  timestamp: number
  hashtags: string[]
  listEventIds: string[]
} | null = null

export default function TrendingNotes() {
  const { t } = useTranslation()
  const { isEventDeleted } = useDeletedEvent()
  const { hideUntrustedNotes, isUserTrusted } = useUserTrust()
  const { pubkey, relayList } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const [trendingNotes, setTrendingNotes] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Get relays based on user login status
  const getRelays = useMemo(() => {
    const relays: string[] = []

    if (pubkey) {
      // User is logged in: favorite relays + inboxes (read relays)
      relays.push(...favoriteRelays)
      if (relayList?.read) {
        relays.push(...relayList.read)
      }
    } else {
      // User is not logged in: BIG_RELAY_URLS + FAST_READ_RELAY_URLS
      relays.push(...BIG_RELAY_URLS)
      relays.push(...FAST_READ_RELAY_URLS)
    }

    // Normalize and deduplicate
    const normalized = relays
      .map(url => normalizeUrl(url))
      .filter((url): url is string => !!url)
    
    return Array.from(new Set(normalized))
  }, [pubkey, favoriteRelays, relayList])

  // Initialize or update cache on mount
  useEffect(() => {
    const initializeCache = async () => {
      const now = Date.now()
      
      // Check if cache is still valid
      if (cachedCustomEvents && (now - cachedCustomEvents.timestamp) < CACHE_DURATION) {
        console.log('[TrendingNotes] Using existing cache')
        return
      }

      console.log('[TrendingNotes] Initializing cache from relays')
      const relays = getRelays

      try {
        // Fetch all events for custom feeds
        const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
        
        // 1. Fetch top-level posts from last 24 hours
        const recentEvents = await client.fetchEvents(relays, {
          kinds: [1, 11, 30023, 9802, 20, 21, 22],
          since: twentyFourHoursAgo,
          limit: 500
        })

        // Filter for top-level posts only
        const topLevelEvents = recentEvents.filter(event => {
          const eTags = event.tags.filter(t => t[0] === 'e')
          return eTags.length === 0
        })

        // Fetch stats for events in batches
        const eventsNeedingStats = topLevelEvents.filter(event => !noteStatsService.getNoteStats(event.id))
        
        if (eventsNeedingStats.length > 0) {
          const batchSize = 10
          for (let i = 0; i < eventsNeedingStats.length; i += batchSize) {
            const batch = eventsNeedingStats.slice(i, i + batchSize)
            await Promise.all(batch.map(event => 
              noteStatsService.fetchNoteStats(event, undefined).catch(() => {})
            ))
            if (i + batchSize < eventsNeedingStats.length) {
              await new Promise(resolve => setTimeout(resolve, 200))
            }
          }
        }

        // Score events
        const scoredEvents = topLevelEvents.map((event) => {
          const stats = noteStatsService.getNoteStats(event.id)
          let score = 0

          if (stats?.likes) score += stats.likes.length
          if (stats?.zaps) score += stats.zaps.length
          if (stats?.replies) score += stats.replies.length * 3
          if (stats?.reposts) score += stats.reposts.length * 5
          if (stats?.quotes) score += stats.quotes.length * 8
          if (stats?.highlights) score += stats.highlights.length * 10

          return { event, score }
        })

        // Update cache
        cachedCustomEvents = {
          events: scoredEvents,
          timestamp: now,
          hashtags: [], // Will be populated when we add hashtags support
          listEventIds: [] // Will be populated when we add bookmarks/pins support
        }

        console.log('[TrendingNotes] Cache initialized with', scoredEvents.length, 'events')
      } catch (error) {
        console.error('[TrendingNotes] Error initializing cache:', error)
      }
    }

    initializeCache()
  }, [getRelays])

  const filteredEvents = useMemo(() => {
    const idSet = new Set<string>()

    return trendingNotes.slice(0, showCount).filter((evt) => {
      if (isEventDeleted(evt)) return false
      if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return false

      const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
      if (idSet.has(id)) {
        return false
      }
      idSet.add(id)
      return true
    })
  }, [trendingNotes, hideUntrustedNotes, showCount, isEventDeleted])

  useEffect(() => {
    const fetchTrendingPosts = async () => {
      setLoading(true)
      const events = await client.fetchTrendingNotes()
      setTrendingNotes(events)
      setLoading(false)
    }

    fetchTrendingPosts()
  }, [])

  useEffect(() => {
    if (showCount >= trendingNotes.length) return

    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setShowCount((prev) => prev + SHOW_COUNT)
      }
    }, options)

    const currentBottomRef = bottomRef.current

    if (currentBottomRef) {
      observerInstance.observe(currentBottomRef)
    }

    return () => {
      if (observerInstance && currentBottomRef) {
        observerInstance.unobserve(currentBottomRef)
      }
    }
  }, [loading, trendingNotes, showCount])

  return (
    <div className="min-h-screen">
      <div className="sticky top-12 h-12 px-4 flex flex-col justify-center text-lg font-bold bg-background z-30 border-b">
        {t('Trending Notes')}
      </div>
      {filteredEvents.map((event) => (
        <NoteCard key={event.id} className="w-full" event={event} />
      ))}
      {showCount < trendingNotes.length || loading ? (
        <div ref={bottomRef}>
          <NoteCardLoadingSkeleton />
        </div>
      ) : (
        <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
      )}
    </div>
  )
}
