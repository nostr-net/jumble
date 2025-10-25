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
import { useZap } from '@/providers/ZapProvider'
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

// Flag to prevent concurrent initialization
let isInitializing = false

export default function TrendingNotes() {
  const { t } = useTranslation()
  const { isEventDeleted } = useDeletedEvent()
  const { hideUntrustedNotes, isUserTrusted } = useUserTrust()
  const { pubkey, relayList, bookmarkListEvent, interestListEvent } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const { zapReplyThreshold } = useZap()
  const [trendingNotes, setTrendingNotes] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Extract hashtags from interest list (kind 10015)
  const hashtags = useMemo(() => {
    if (!interestListEvent) return []
    const tags: string[] = []
    interestListEvent.tags.forEach((tag) => {
      if (tag[0] === 't' && tag[1]) {
        tags.push(tag[1])
      }
    })
    return tags
  }, [interestListEvent])

  // Extract event IDs from bookmark and pin lists (kinds 10003 and 10001)
  const listEventIds = useMemo(() => {
    const eventIds: string[] = []
    
    // Add bookmarks (kind 10003)
    if (bookmarkListEvent) {
      bookmarkListEvent.tags.forEach((tag) => {
        if (tag[0] === 'e' && tag[1]) {
          eventIds.push(tag[1])
        }
      })
    }
    
    // Add pins (kind 10001) - fetch from client
    // Note: We'll fetch pin list event separately since it's not in NostrProvider
    
    return eventIds
  }, [bookmarkListEvent])

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

  // Initialize cache only once on mount
  useEffect(() => {
    const initializeCache = async () => {
      // Prevent concurrent initialization
      if (isInitializing) {
        console.log('[TrendingNotes] Already initializing, skipping')
        return
      }
      
      const now = Date.now()
      
      // Check if cache is still valid
      if (cachedCustomEvents && (now - cachedCustomEvents.timestamp) < CACHE_DURATION) {
        console.log('[TrendingNotes] Using existing cache')
        return
      }

      isInitializing = true
      console.log('[TrendingNotes] Initializing cache from relays')
      const relays = getRelays
      console.log('[TrendingNotes] Using', relays.length, 'relays:', relays)
      
      // Prevent running if we have no relays
      if (relays.length === 0) {
        console.log('[TrendingNotes] No relays available, skipping cache initialization')
        return
      }

      try {
        const allEvents: NostrEvent[] = []
        const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
        
        // 1. Fetch top-level posts from last 24 hours - query each relay individually
        const recentEventsPromises = relays.map(async (relay) => {
          const events = await client.fetchEvents([relay], {
            kinds: [1, 11, 30023, 9802, 20, 21, 22],
            since: twentyFourHoursAgo,
            limit: 500
          })
          return events
        })
        const recentEventsArrays = await Promise.all(recentEventsPromises)
        const recentEvents = recentEventsArrays.flat()
        console.log('[TrendingNotes] Fetched', recentEvents.length, 'recent events from', relays.length, 'relays')
        allEvents.push(...recentEvents)

        // 2. Fetch events from bookmark/pin lists
        if (listEventIds.length > 0) {
          const bookmarkPinEvents = await client.fetchEvents(relays, {
            ids: listEventIds,
            limit: 500
          })
          console.log('[TrendingNotes] Fetched', bookmarkPinEvents.length, 'events from bookmark/pin lists')
          allEvents.push(...bookmarkPinEvents)
        }

        // 3. Fetch pin list if user is logged in
        if (pubkey) {
          try {
            const pinListEvent = await client.fetchPinListEvent(pubkey)
            if (pinListEvent) {
              const pinEventIds = pinListEvent.tags
                .filter(tag => tag[0] === 'e' && tag[1])
                .map(tag => tag[1])
              
              if (pinEventIds.length > 0) {
                const pinEvents = await client.fetchEvents(relays, {
                  ids: pinEventIds,
                  limit: 500
                })
                console.log('[TrendingNotes] Fetched', pinEvents.length, 'events from pin list')
                allEvents.push(...pinEvents)
              }
            }
          } catch (error) {
            console.error('[TrendingNotes] Error fetching pin list:', error)
          }
        }

        // Filter for top-level posts only (no replies or quotes)
        const topLevelEvents = allEvents.filter(event => {
          const eTags = event.tags.filter(t => t[0] === 'e')
          return eTags.length === 0
        })
        console.log('[TrendingNotes] After filtering for top-level posts:', topLevelEvents.length, 'events')

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
          if (stats?.zaps) {
            // Superzaps (above threshold) count as quotes (8 points)
            // Regular zaps count as reactions (1 point)
            stats.zaps.forEach(zap => {
              if (zap.amount >= zapReplyThreshold) {
                score += 8 // Superzap
              } else {
                score += 1 // Regular zap
              }
            })
          }
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
          hashtags: hashtags.slice(),
          listEventIds: listEventIds.slice()
        }

        console.log('[TrendingNotes] Cache initialized with', scoredEvents.length, 'events')
      } catch (error) {
        console.error('[TrendingNotes] Error initializing cache:', error)
      } finally {
        isInitializing = false
      }
    }

    initializeCache()
    // Only run when getRelays changes (which happens when login status changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
