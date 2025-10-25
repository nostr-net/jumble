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

type TrendingTab = 'band' | 'relays' | 'bookmarks' | 'hashtags'
type SortOrder = 'newest' | 'oldest' | 'most-popular' | 'least-popular'
type BookmarkFilter = 'yours' | 'follows'
type HashtagFilter = 'popular'

export default function TrendingNotes() {
  const { t } = useTranslation()
  const { isEventDeleted } = useDeletedEvent()
  const { hideUntrustedNotes, isUserTrusted } = useUserTrust()
  const { pubkey, relayList, bookmarkListEvent } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const { zapReplyThreshold } = useZap()
  const [trendingNotes, setTrendingNotes] = useState<NostrEvent[]>([])
  const [showCount, setShowCount] = useState(10)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TrendingTab>('band')
  const [sortOrder, setSortOrder] = useState<SortOrder>('most-popular')
  const [bookmarkFilter] = useState<BookmarkFilter>('yours')
  const [hashtagFilter] = useState<HashtagFilter>('popular')
  const [selectedHashtag, setSelectedHashtag] = useState<string | null>(null)
  const [popularHashtags, setPopularHashtags] = useState<string[]>([])
  const [cacheEvents, setCacheEvents] = useState<NostrEvent[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)


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

  // Fetch bookmark/pin lists from follows
  const [followsBookmarkEventIds, setFollowsBookmarkEventIds] = useState<string[]>([])
  
  useEffect(() => {
    const fetchFollowsBookmarks = async () => {
      if (!pubkey) return
      
      try {
        // Get follows list
        const followPubkeys = await client.fetchFollowings(pubkey)
        if (!followPubkeys || followPubkeys.length === 0) return
        
        // Fetch bookmark and pin lists from follows
        const bookmarkPromises = followPubkeys.map(async (followPubkey: string) => {
          try {
            const [bookmarkList, pinList] = await Promise.all([
              client.fetchBookmarkListEvent(followPubkey),
              client.fetchPinListEvent(followPubkey)
            ])
            
            const eventIds: string[] = []
            if (bookmarkList) {
              bookmarkList.tags.forEach(tag => {
                if (tag[0] === 'e' && tag[1]) {
                  eventIds.push(tag[1])
                }
              })
            }
            if (pinList) {
              pinList.tags.forEach(tag => {
                if (tag[0] === 'e' && tag[1]) {
                  eventIds.push(tag[1])
                }
              })
            }
            return eventIds
          } catch (error) {
            console.error(`Error fetching bookmarks for ${followPubkey}:`, error)
            return []
          }
        })
        
        const allEventIds = await Promise.all(bookmarkPromises)
        const flattenedIds = allEventIds.flat()
        setFollowsBookmarkEventIds(flattenedIds)
      } catch (error) {
        console.error('Error fetching follows bookmarks:', error)
      }
    }
    
    fetchFollowsBookmarks()
  }, [pubkey])

  // Calculate popular hashtags from cache events (all events from relays)
  const calculatePopularHashtags = useMemo(() => {
    console.log('[TrendingNotes] calculatePopularHashtags - cacheEvents.length:', cacheEvents.length, 'trendingNotes.length:', trendingNotes.length)
    
    // Use cache events if available, otherwise fallback to trending notes
    let eventsToAnalyze = cacheEvents.length > 0 ? cacheEvents : trendingNotes
    
    if (eventsToAnalyze.length === 0) {
      return []
    }
    
    const hashtagCounts = new Map<string, number>()
    let eventsWithHashtags = 0
    
    eventsToAnalyze.forEach((event) => {
      let hasAnyHashtag = false
      
      // Count hashtags from 't' tags
      event.tags.forEach(tag => {
        if (tag[0] === 't' && tag[1]) {
          const hashtag = tag[1].toLowerCase()
          hashtagCounts.set(hashtag, (hashtagCounts.get(hashtag) || 0) + 1)
          hasAnyHashtag = true
        }
      })
      
      // Count hashtags from content (simple regex for #hashtag)
      const contentHashtags = event.content.match(/#[a-zA-Z0-9_]+/g)
      if (contentHashtags) {
        contentHashtags.forEach(hashtag => {
          const cleanHashtag = hashtag.slice(1).toLowerCase() // Remove #
          hashtagCounts.set(cleanHashtag, (hashtagCounts.get(cleanHashtag) || 0) + 1)
          hasAnyHashtag = true
        })
      }
      
      if (hasAnyHashtag) eventsWithHashtags++
    })
    
    // Sort by count and return top 10
    const result = Array.from(hashtagCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([hashtag]) => hashtag)
    
    console.log('[TrendingNotes] calculatePopularHashtags - found hashtags:', result)
    console.log('[TrendingNotes] calculatePopularHashtags - eventsWithHashtags:', eventsWithHashtags)
    
    return result
  }, [cacheEvents, trendingNotes, activeTab, hashtagFilter, pubkey]) // Use cacheEvents and trendingNotes as dependencies

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

  // Update popular hashtags when trending notes change
  useEffect(() => {
    console.log('[TrendingNotes] calculatePopularHashtags result:', calculatePopularHashtags)
    setPopularHashtags(calculatePopularHashtags)
  }, [calculatePopularHashtags])

  // Fallback: populate cacheEvents from trendingNotes if cache is empty
  useEffect(() => {
    if (activeTab === 'hashtags' && cacheEvents.length === 0 && trendingNotes.length > 0) {
      console.log('[TrendingNotes] Fallback: populating cacheEvents from trendingNotes')
      setCacheEvents(trendingNotes)
    }
  }, [activeTab, cacheEvents.length, trendingNotes])


  // Initialize cache only once on mount
  useEffect(() => {
    const initializeCache = async () => {
      // Prevent concurrent initialization
      if (isInitializing) {
        return
      }
      
      const now = Date.now()
      
      // Check if cache is still valid
      if (cachedCustomEvents && (now - cachedCustomEvents.timestamp) < CACHE_DURATION) {
        // If cache is valid, set cacheEvents to ALL events from cache
        const allEvents = cachedCustomEvents.events.map(item => item.event)
        setCacheEvents(allEvents)
        return
      }

      isInitializing = true
      const relays = getRelays // This is already a value from useMemo
      
      // Prevent running if we have no relays
      if (relays.length === 0) {
        isInitializing = false
        return
      }

      try {
        const allEvents: NostrEvent[] = []
        const twentyFourHoursAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60
        
        // 1. Fetch top-level posts from last 24 hours - batch requests to avoid overwhelming relays
        const batchSize = 3 // Process 3 relays at a time
        const recentEvents: NostrEvent[] = []
        
        for (let i = 0; i < relays.length; i += batchSize) {
          const batch = relays.slice(i, i + batchSize)
          const batchPromises = batch.map(async (relay) => {
            try {
              const events = await client.fetchEvents([relay], {
                kinds: [1, 11, 30023, 9802, 20, 21, 22],
                since: twentyFourHoursAgo,
                limit: 500
              })
              return events
            } catch (error) {
              console.warn(`[TrendingNotes] Error fetching from relay ${relay}:`, error)
              return []
            }
          })
          
          const batchResults = await Promise.all(batchPromises)
          recentEvents.push(...batchResults.flat())
          
          // Add a small delay between batches to be respectful to relays
          if (i + batchSize < relays.length) {
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        
        allEvents.push(...recentEvents)

        // 2. Fetch events from bookmark/pin lists (with rate limiting)
        if (listEventIds.length > 0) {
          try {
            const bookmarkPinEvents = await client.fetchEvents(relays, {
              ids: listEventIds,
              limit: 500
            })
            allEvents.push(...bookmarkPinEvents)
          } catch (error) {
            console.warn('[TrendingNotes] Error fetching bookmark/pin events:', error)
          }
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
                try {
                  const pinEvents = await client.fetchEvents(relays, {
                    ids: pinEventIds,
                    limit: 500
                  })
                  allEvents.push(...pinEvents)
                } catch (error) {
                  console.warn('[TrendingNotes] Error fetching pin events:', error)
                }
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

        // Filter out NSFW content and content warnings
        const filteredEvents = topLevelEvents.filter(event => {
          // Check for NSFW in 't' tags
          const hasNsfwTag = event.tags.some(tag => 
            tag[0] === 't' && tag[1] && tag[1].toLowerCase() === 'nsfw'
          )
          
          // Check for sensitive content tag
          const hasSensitiveTag = event.tags.some(tag => 
            tag[0] === 't' && tag[1] && tag[1].toLowerCase() === 'sensitive'
          )
          
          // Check for #NSFW hashtag in content
          const hasNsfwHashtag = event.content.toLowerCase().includes('#nsfw')
          
          // Check for content-warning tag (NIP-36)
          const hasContentWarning = event.tags.some(tag => 
            tag[0] === 'content-warning'
          )
          
          // Check for L tag with content-warning namespace
          const hasContentWarningL = event.tags.some(tag => 
            tag[0] === 'L' && tag[1] && tag[1].toLowerCase() === 'content-warning'
          )
          
          // Check for l tag with content-warning namespace
          const hasContentWarningl = event.tags.some(tag => 
            tag[0] === 'l' && tag[1] && tag[1].toLowerCase() === 'content-warning'
          )
          
          // Filter out if any NSFW or content warning indicators are found
          return !hasNsfwTag && !hasSensitiveTag && !hasNsfwHashtag && 
                 !hasContentWarning && !hasContentWarningL && !hasContentWarningl
        })

        // Fetch stats for events in batches with longer delays
        const eventsNeedingStats = filteredEvents.filter(event => !noteStatsService.getNoteStats(event.id))
        
        if (eventsNeedingStats.length > 0) {
          const batchSize = 5 // Reduced batch size
          for (let i = 0; i < eventsNeedingStats.length; i += batchSize) {
            const batch = eventsNeedingStats.slice(i, i + batchSize)
            await Promise.all(batch.map(event => 
              noteStatsService.fetchNoteStats(event, undefined).catch(() => {})
            ))
            if (i + batchSize < eventsNeedingStats.length) {
              await new Promise(resolve => setTimeout(resolve, 500)) // Increased delay
            }
          }
        }

        // Score events
        const scoredEvents = filteredEvents.map((event) => {
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
          hashtags: [],
          listEventIds: listEventIds.slice()
        }

        // Store ALL events from the cache for hashtag analysis
        // This includes all events from relays, not just the trending ones
        setCacheEvents(filteredEvents)
      } catch (error) {
        console.error('[TrendingNotes] Error initializing cache:', error)
      } finally {
        isInitializing = false
      }
    }

    initializeCache()
    // Only run when getRelays changes (which happens when login status changes)
  }, [getRelays])

  const filteredEvents = useMemo(() => {
    const idSet = new Set<string>()
    
    // Use appropriate data source based on tab and filter
    let sourceEvents: NostrEvent[] = []
    
    if (activeTab === 'band') {
      // "on Band" tab: use trending notes from nostr.band API
      sourceEvents = trendingNotes
    } else if (activeTab === 'relays') {
      // "on your relays" tab: use cache events from user's relays
      sourceEvents = cacheEvents
    } else if (activeTab === 'hashtags') {
      // Hashtags tab: use cache events for hashtag analysis
      sourceEvents = cacheEvents.length > 0 ? cacheEvents : trendingNotes
      console.log('[TrendingNotes] Hashtags tab - using ALL events from cache')
      console.log('[TrendingNotes] Hashtags tab - cacheEvents.length:', cacheEvents.length, 'trendingNotes.length:', trendingNotes.length)
    }
    
    
    let filtered = sourceEvents.filter((evt) => {
      if (isEventDeleted(evt)) return false
      if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) return false

      // Filter based on active tab
      if (activeTab === 'hashtags') {
        if (hashtagFilter === 'popular') {
          // Check if event has any hashtags (either in 't' tags or content)
          const eventHashtags = evt.tags
            .filter(tag => tag[0] === 't' && tag[1])
            .map(tag => tag[1].toLowerCase())
          const contentHashtags = evt.content.match(/#[a-zA-Z0-9_]+/g)?.map(h => h.slice(1).toLowerCase()) || []
          const allHashtags = [...eventHashtags, ...contentHashtags]
          
          // Only show events that have at least one hashtag
          if (allHashtags.length === 0) return false
          
          if (selectedHashtag) {
            // Filter by selected popular hashtag - only show events that contain this specific hashtag
            if (!allHashtags.includes(selectedHashtag.toLowerCase())) return false
          }
        }
      } else if (activeTab === 'relays') {
        // For "on your relays" tab, we'll show all events (they're already from user's relays)
        // This is the default behavior, so no additional filtering needed
      } else if (activeTab === 'band') {
        // For "on Band" tab, we'll show all events (this is the general trending)
        // This is the default behavior, so no additional filtering needed
      }

      const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
      if (idSet.has(id)) {
        return false
      }
      idSet.add(id)
      return true
    })

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.created_at - a.created_at
      } else if (sortOrder === 'oldest') {
        return a.created_at - b.created_at
      } else if (sortOrder === 'most-popular' || sortOrder === 'least-popular') {
        const statsA = noteStatsService.getNoteStats(a.id)
        const statsB = noteStatsService.getNoteStats(b.id)
        
        let scoreA = 0
        let scoreB = 0
        
        if (statsA) {
          scoreA += (statsA.likes?.length || 0)
          scoreA += (statsA.replies?.length || 0) * 3
          scoreA += (statsA.reposts?.length || 0) * 5
          scoreA += (statsA.quotes?.length || 0) * 8
          scoreA += (statsA.highlights?.length || 0) * 10
          if (statsA.zaps) {
            statsA.zaps.forEach(zap => {
              scoreA += zap.amount >= zapReplyThreshold ? 8 : 1
            })
          }
        }
        
        if (statsB) {
          scoreB += (statsB.likes?.length || 0)
          scoreB += (statsB.replies?.length || 0) * 3
          scoreB += (statsB.reposts?.length || 0) * 5
          scoreB += (statsB.quotes?.length || 0) * 8
          scoreB += (statsB.highlights?.length || 0) * 10
          if (statsB.zaps) {
            statsB.zaps.forEach(zap => {
              scoreB += zap.amount >= zapReplyThreshold ? 8 : 1
            })
          }
        }
        
        return sortOrder === 'most-popular' ? scoreB - scoreA : scoreA - scoreB
      }
      
      return 0
    })

    return filtered.slice(0, showCount)
  }, [trendingNotes, hideUntrustedNotes, showCount, isEventDeleted, isUserTrusted, activeTab, listEventIds, bookmarkFilter, followsBookmarkEventIds, hashtagFilter, selectedHashtag, sortOrder, zapReplyThreshold, cacheEvents])


  useEffect(() => {
    const fetchTrendingPosts = async () => {
      setLoading(true)
      const events = await client.fetchTrendingNotes()
      
      // Apply the same NSFW and content warning filtering
      const filteredEvents = events.filter(event => {
        // Check for NSFW in 't' tags
        const hasNsfwTag = event.tags.some(tag => 
          tag[0] === 't' && tag[1] && tag[1].toLowerCase() === 'nsfw'
        )
        
        // Check for sensitive content tag
        const hasSensitiveTag = event.tags.some(tag => 
          tag[0] === 't' && tag[1] && tag[1].toLowerCase() === 'sensitive'
        )
        
        // Check for #NSFW hashtag in content
        const hasNsfwHashtag = event.content.toLowerCase().includes('#nsfw')
        
        // Check for content-warning tag (NIP-36)
        const hasContentWarning = event.tags.some(tag => 
          tag[0] === 'content-warning'
        )
        
        // Check for L tag with content-warning namespace
        const hasContentWarningL = event.tags.some(tag => 
          tag[0] === 'L' && tag[1] && tag[1].toLowerCase() === 'content-warning'
        )
        
        // Check for l tag with content-warning namespace
        const hasContentWarningl = event.tags.some(tag => 
          tag[0] === 'l' && tag[1] && tag[1].toLowerCase() === 'content-warning'
        )
        
        // Filter out if any NSFW or content warning indicators are found
        return !hasNsfwTag && !hasSensitiveTag && !hasNsfwHashtag && 
               !hasContentWarning && !hasContentWarningL && !hasContentWarningl
      })
      
      setTrendingNotes(filteredEvents)
      setLoading(false)
    }

    fetchTrendingPosts()
  }, [])

  // Reset showCount when tab changes
  useEffect(() => {
    setShowCount(10)
  }, [activeTab])

  // Reset filters when switching tabs
  useEffect(() => {
    if (activeTab === 'band') {
      setSortOrder('most-popular')
    } else if (activeTab === 'relays') {
      setSortOrder('most-popular')
    } else if (activeTab === 'hashtags') {
      setSortOrder('most-popular')
      setSelectedHashtag(null)
    }
  }, [activeTab, pubkey])

  // Handle case where bookmarks tab is not available
  useEffect(() => {
    if (!pubkey && activeTab === 'bookmarks') {
      setActiveTab('band')
    }
  }, [pubkey, activeTab])

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
      <div className="sticky top-12 bg-background z-30 border-b">
        <div className="h-12 px-4 flex flex-col justify-center text-lg font-bold">
          {t('Trending Notes')}
        </div>
        <div className="flex items-center gap-2 px-4 pb-2">
          <span className="text-sm font-medium text-muted-foreground">Trending:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('band')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === 'band'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              on Band
            </button>
            <button
              onClick={() => setActiveTab('relays')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === 'relays'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              on your relays
            </button>
            <button
              onClick={() => setActiveTab('hashtags')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === 'hashtags'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80 text-muted-foreground'
              }`}
            >
              hashtags
            </button>
          </div>
        </div>
        
        {/* Second row controls for tabs 2-3 */}
        {(activeTab === 'relays' || activeTab === 'hashtags') && (
          <div className="flex items-center gap-4 px-4 pb-2">
            {/* Sorting controls - not shown for hashtags tab */}
            {activeTab !== 'hashtags' && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sort:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSortOrder('newest')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      sortOrder === 'newest'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    newest
                  </button>
                  <button
                    onClick={() => setSortOrder('oldest')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      sortOrder === 'oldest'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    oldest
                  </button>
                  <button
                    onClick={() => setSortOrder('most-popular')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      sortOrder === 'most-popular'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    most popular
                  </button>
                  <button
                    onClick={() => setSortOrder('least-popular')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      sortOrder === 'least-popular'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    least popular
                  </button>
                </div>
              </div>
            )}


          </div>
        )}



        {/* Popular hashtag buttons for hashtags tab */}
        {activeTab === 'hashtags' && hashtagFilter === 'popular' && popularHashtags.length > 0 && (
          <div className="flex items-center gap-2 px-4 pb-2">
            <span className="text-xs text-muted-foreground">Popular hashtags:</span>
            <div className="flex gap-1 flex-wrap">
              {popularHashtags.map((hashtag) => (
                <button
                  key={hashtag}
                  onClick={() => setSelectedHashtag(selectedHashtag === hashtag ? null : hashtag)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    selectedHashtag === hashtag
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/50 hover:bg-muted text-muted-foreground'
                  }`}
                >
                  #{hashtag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {filteredEvents.map((event) => (
        <NoteCard key={event.id} className="w-full" event={event} />
      ))}
      {(() => {
        // Determine the current data source length based on active tab
        const currentDataLength = activeTab === 'band' ? trendingNotes.length : 
                                   activeTab === 'relays' || activeTab === 'hashtags' ? cacheEvents.length : 
                                   trendingNotes.length
        
        if (showCount < currentDataLength || loading) {
          return (
            <div ref={bottomRef}>
              <NoteCardLoadingSkeleton />
            </div>
          )
        }
        return <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
      })()}
    </div>
  )
}
