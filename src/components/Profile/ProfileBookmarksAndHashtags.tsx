import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useState, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS } from '@/constants'
import logger from '@/lib/logger'
import { normalizeUrl } from '@/lib/url'
import NoteCard from '../NoteCard'
import { Skeleton } from '../ui/skeleton'

type TabValue = 'bookmarks' | 'hashtags' | 'pins'

const ProfileBookmarksAndHashtags = forwardRef<{ refresh: () => void }, {
  pubkey: string
  initialTab?: TabValue
  searchQuery?: string
}>(({ pubkey, initialTab = 'pins', searchQuery = '' }, ref) => {
  const { t } = useTranslation()
  const { pubkey: myPubkey } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const [bookmarkEvents, setBookmarkEvents] = useState<Event[]>([])
  const [hashtagEvents, setHashtagEvents] = useState<Event[]>([])
  const [pinEvents, setPinEvents] = useState<Event[]>([])
  const [loadingBookmarks, setLoadingBookmarks] = useState(true)
  const [loadingHashtags, setLoadingHashtags] = useState(true)
  const [loadingPins, setLoadingPins] = useState(true)
  const [bookmarkListEvent, setBookmarkListEvent] = useState<Event | null>(null)
  const [interestListEvent, setInterestListEvent] = useState<Event | null>(null)
  const [pinListEvent, setPinListEvent] = useState<Event | null>(null)
  
  // Retry state for each tab
  const [retryCountBookmarks, setRetryCountBookmarks] = useState(0)
  const [retryCountHashtags, setRetryCountHashtags] = useState(0)
  const [retryCountPins, setRetryCountPins] = useState(0)
  const [isRetryingBookmarks, setIsRetryingBookmarks] = useState(false)
  const [isRetryingHashtags, setIsRetryingHashtags] = useState(false)
  const [isRetryingPins, setIsRetryingPins] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const maxRetries = 3

  // Build comprehensive relay list for fetching bookmark and interest list events
  // Using the same comprehensive relay list construction as pin lists
  const buildComprehensiveRelayList = useCallback(async () => {
    const myRelayList = myPubkey ? await client.fetchRelayList(myPubkey) : { write: [], read: [] }
    const allRelays = [
      ...(myRelayList.read || []), // User's inboxes (kind 10002)
      ...(myRelayList.write || []), // User's outboxes (kind 10002)
      ...(favoriteRelays || []), // User's favorite relays (kind 10012)
      ...BIG_RELAY_URLS,         // Big relays
      ...FAST_READ_RELAY_URLS,   // Fast read relays
      ...FAST_WRITE_RELAY_URLS   // Fast write relays
    ]
    
    const normalizedRelays = allRelays
      .map(url => normalizeUrl(url))
      .filter((url): url is string => !!url)
    
    const comprehensiveRelays = Array.from(new Set(normalizedRelays))
    // Debug: Relay configuration for bookmark/interest list events
    // console.log('[ProfileBookmarksAndHashtags] Using', comprehensiveRelays.length, 'relays for bookmark/interest list events:', comprehensiveRelays)
    
    return comprehensiveRelays
  }, [myPubkey, favoriteRelays])

  // Fetch bookmark list event and associated events
  const fetchBookmarks = useCallback(async (isRetry = false, isRefresh = false) => {
    if (!isRetry && !isRefresh) {
      setLoadingBookmarks(true)
      setRetryCountBookmarks(0)
    } else if (isRetry) {
      setIsRetryingBookmarks(true)
    }
    
    try {
      const comprehensiveRelays = await buildComprehensiveRelayList()
      
      // Try to fetch bookmark list event from comprehensive relay list first
      let bookmarkList = null
      try {
        const bookmarkListEvents = await client.fetchEvents(comprehensiveRelays, {
          authors: [pubkey],
          kinds: [10003], // Bookmark list kind
          limit: 1
        })
        bookmarkList = bookmarkListEvents[0] || null
      } catch (error) {
        logger.component('ProfileBookmarksAndHashtags', 'Error fetching bookmark list from comprehensive relays, falling back to default method', { error: (error as Error).message })
        bookmarkList = await client.fetchBookmarkListEvent(pubkey)
      }
      
      // console.log('[ProfileBookmarksAndHashtags] Bookmark list event:', bookmarkList)
      setBookmarkListEvent(bookmarkList)
      
      if (bookmarkList && bookmarkList.tags.length > 0) {
        // Extract event IDs from bookmark list
        const eventIds = bookmarkList.tags
          .filter(tag => tag[0] === 'e' && tag[1])
          .map(tag => tag[1])
          .reverse() // Reverse to show newest first
        
        // Extract 'a' tags for replaceable events (publications, articles, etc.)
        const aTags = bookmarkList.tags
          .filter(tag => tag[0] === 'a' && tag[1])
          .map(tag => tag[1])
        
        // console.log('[ProfileBookmarksAndHashtags] Found', eventIds.length, 'bookmark event IDs and', aTags.length, 'a tags')
        
        // Fetch both regular events and replaceable events
        const eventPromises: Promise<Event[]>[] = []
        
        if (eventIds.length > 0) {
          eventPromises.push(client.fetchEvents(comprehensiveRelays, {
            ids: eventIds,
            limit: 100
          }))
        }
        
        if (aTags.length > 0) {
          // For 'a' tags, we need to fetch replaceable events
          // Parse the coordinate to get kind, pubkey, and d tag
          const aTagFetches = aTags.map(async (aTag) => {
            // aTag format: "kind:pubkey:d"
            const parts = aTag.split(':')
            if (parts.length < 2) return null
            const kind = parseInt(parts[0])
            const pubkey = parts[1]
            const d = parts[2] || ''
            
            const filter: any = {
              authors: [pubkey],
              kinds: [kind],
              limit: 1
            }
            if (d) {
              filter['#d'] = [d]
            }
            
            const events = await client.fetchEvents(comprehensiveRelays, [filter])
            return events[0] || null
          })
          
          eventPromises.push(Promise.all(aTagFetches).then(events => events.filter((e): e is Event => e !== null)))
        }
        
        if (eventPromises.length > 0) {
          try {
            const eventArrays = await Promise.all(eventPromises)
            const events = eventArrays.flat()
            logger.debug('[ProfileBookmarksAndHashtags] Fetched', events.length, 'bookmark events')
            
            if (isRefresh) {
              // For refresh, append new events and deduplicate
              setBookmarkEvents(prevEvents => {
                const existingIds = new Set(prevEvents.map(e => e.id))
                const newEvents = events.filter(event => !existingIds.has(event.id))
                const combinedEvents = [...newEvents, ...prevEvents]
                // Re-sort the combined events
                return combinedEvents.sort((a, b) => b.created_at - a.created_at)
              })
            } else {
              setBookmarkEvents(events)
            }
          } catch (error) {
            logger.warn('[ProfileBookmarksAndHashtags] Error fetching bookmark events:', error)
            setBookmarkEvents([])
          }
        } else {
          setBookmarkEvents([])
        }
      } else {
        setBookmarkEvents([])
      }
      
      // Reset retry count on successful fetch
      if (isRetry) {
        setRetryCountBookmarks(0)
      }
    } catch (error) {
      logger.component('ProfileBookmarksAndHashtags', 'Error fetching bookmarks', { error: (error as Error).message, retryCount: isRetry ? retryCountBookmarks + 1 : 0 })
      
      // If this is not a retry and we haven't exceeded max retries, schedule a retry
      if (!isRetry && retryCountBookmarks < maxRetries) {
        console.log('[ProfileBookmarksAndHashtags] Scheduling bookmark retry', retryCountBookmarks + 1, 'of', maxRetries)
        // Use shorter delays for initial retries, then exponential backoff
        const delay = retryCountBookmarks === 0 ? 1000 : retryCountBookmarks === 1 ? 2000 : 3000
        setTimeout(() => {
          setRetryCountBookmarks(prev => prev + 1)
          fetchBookmarks(true)
        }, delay)
      } else {
        setBookmarkEvents([])
      }
    } finally {
      setLoadingBookmarks(false)
      setIsRetryingBookmarks(false)
      if (isRefresh) {
        setIsRefreshing(false)
      }
    }
  }, [pubkey, buildComprehensiveRelayList, retryCountBookmarks, maxRetries])

  // Fetch interest list event and associated events
  const fetchHashtags = useCallback(async (isRetry = false, isRefresh = false) => {
    if (!isRetry && !isRefresh) {
      setLoadingHashtags(true)
      setRetryCountHashtags(0)
    } else if (isRetry) {
      setIsRetryingHashtags(true)
    }
    
    try {
      const comprehensiveRelays = await buildComprehensiveRelayList()
      
      // Try to fetch interest list event from comprehensive relay list first
      let interestList = null
      try {
        const interestListEvents = await client.fetchEvents(comprehensiveRelays, {
          authors: [pubkey],
          kinds: [10015], // Interest list kind
          limit: 1
        })
        interestList = interestListEvents[0] || null
      } catch (error) {
        logger.component('ProfileBookmarksAndHashtags', 'Error fetching interest list from comprehensive relays, falling back to default method', { error: (error as Error).message })
        interestList = await client.fetchInterestListEvent(pubkey)
      }
      
      // console.log('[ProfileBookmarksAndHashtags] Interest list event:', interestList)
      setInterestListEvent(interestList)
      
      if (interestList && interestList.tags.length > 0) {
        // Extract hashtags from interest list
        const hashtags = interestList.tags
          .filter((tag: string[]) => tag[0] === 't' && tag[1])
          .map((tag: string[]) => tag[1])
        
        // console.log('[ProfileBookmarksAndHashtags] Found', hashtags.length, 'interest hashtags:', hashtags)
        
        if (hashtags.length > 0) {
          try {
            // Fetch recent events with these hashtags using the same comprehensive relay list
            const events = await client.fetchEvents(comprehensiveRelays, {
              kinds: [1], // Text notes
              '#t': hashtags,
              limit: 100
            })
            // console.log('[ProfileBookmarksAndHashtags] Fetched', events.length, 'hashtag events')
            
            if (isRefresh) {
              // For refresh, append new events and deduplicate
              setHashtagEvents(prevEvents => {
                const existingIds = new Set(prevEvents.map(e => e.id))
                const newEvents = events.filter(event => !existingIds.has(event.id))
                const combinedEvents = [...newEvents, ...prevEvents]
                // Re-sort the combined events
                return combinedEvents.sort((a, b) => b.created_at - a.created_at)
              })
            } else {
              setHashtagEvents(events)
            }
          } catch (error) {
            logger.component('ProfileBookmarksAndHashtags', 'Error fetching hashtag events', { error: (error as Error).message })
            setHashtagEvents([])
          }
        } else {
          setHashtagEvents([])
        }
      } else {
        setHashtagEvents([])
      }
      
      // Reset retry count on successful fetch
      if (isRetry) {
        setRetryCountHashtags(0)
      }
    } catch (error) {
      logger.component('ProfileBookmarksAndHashtags', 'Error fetching hashtags', { error: (error as Error).message, retryCount: isRetry ? retryCountHashtags + 1 : 0 })
      
      // If this is not a retry and we haven't exceeded max retries, schedule a retry
      if (!isRetry && retryCountHashtags < maxRetries) {
        console.log('[ProfileBookmarksAndHashtags] Scheduling hashtag retry', retryCountHashtags + 1, 'of', maxRetries)
        // Use shorter delays for initial retries, then exponential backoff
        const delay = retryCountHashtags === 0 ? 1000 : retryCountHashtags === 1 ? 2000 : 3000
        setTimeout(() => {
          setRetryCountHashtags(prev => prev + 1)
          fetchHashtags(true)
        }, delay)
      } else {
        setHashtagEvents([])
      }
    } finally {
      setLoadingHashtags(false)
      setIsRetryingHashtags(false)
      if (isRefresh) {
        setIsRefreshing(false)
      }
    }
  }, [pubkey, buildComprehensiveRelayList, retryCountHashtags, maxRetries])

  // Fetch pin list event and associated events
  const fetchPins = useCallback(async (isRetry = false, isRefresh = false) => {
    if (!isRetry && !isRefresh) {
      setLoadingPins(true)
      setRetryCountPins(0)
    } else if (isRetry) {
      setIsRetryingPins(true)
    }
    
    try {
      const comprehensiveRelays = await buildComprehensiveRelayList()
      
      logger.component('ProfileBookmarksAndHashtags', 'Fetching pins for pubkey', { pubkey, relayCount: comprehensiveRelays.length })
      
      // Try to fetch pin list event from comprehensive relay list first
      let pinList = null
      try {
        const pinListEvents = await client.fetchEvents(comprehensiveRelays, {
          authors: [pubkey],
          kinds: [10001], // Pin list kind
          limit: 1
        })
        pinList = pinListEvents[0] || null
        logger.component('ProfileBookmarksAndHashtags', 'Found pin list event', { found: !!pinList })
      } catch (error) {
        logger.component('ProfileBookmarksAndHashtags', 'Error fetching pin list from comprehensive relays, falling back to default method', { error: (error as Error).message })
        pinList = await client.fetchPinListEvent(pubkey)
        logger.component('ProfileBookmarksAndHashtags', 'Fallback pin list event', { found: !!pinList })
      }
      
      // console.log('[ProfileBookmarksAndHashtags] Pin list event:', pinList)
      setPinListEvent(pinList)
      
      if (pinList && pinList.tags.length > 0) {
        // Extract event IDs from pin list
        const eventIds = pinList.tags
          .filter(tag => tag[0] === 'e' && tag[1])
          .map(tag => tag[1])
          .reverse() // Reverse to show newest first
        
        // Extract 'a' tags for replaceable events (publications, articles, etc.)
        const aTags = pinList.tags
          .filter(tag => tag[0] === 'a' && tag[1])
          .map(tag => tag[1])
        
        // console.log('[ProfileBookmarksAndHashtags] Found', eventIds.length, 'pin event IDs and', aTags.length, 'a tags')
        
        // Fetch both regular events and replaceable events
        const eventPromises: Promise<Event[]>[] = []
        
        if (eventIds.length > 0) {
          eventPromises.push(client.fetchEvents(comprehensiveRelays, {
            ids: eventIds,
            limit: 100
          }))
        }
        
        if (aTags.length > 0) {
          // For 'a' tags, we need to fetch replaceable events
          // Parse the coordinate to get kind, pubkey, and d tag
          const aTagFetches = aTags.map(async (aTag) => {
            // aTag format: "kind:pubkey:d"
            const parts = aTag.split(':')
            if (parts.length < 2) return null
            const kind = parseInt(parts[0])
            const pubkey = parts[1]
            const d = parts[2] || ''
            
            const filter: any = {
              authors: [pubkey],
              kinds: [kind],
              limit: 1
            }
            if (d) {
              filter['#d'] = [d]
            }
            
            const events = await client.fetchEvents(comprehensiveRelays, [filter])
            return events[0] || null
          })
          
          eventPromises.push(Promise.all(aTagFetches).then(events => events.filter((e): e is Event => e !== null)))
        }
        
        if (eventPromises.length > 0) {
          try {
            const eventArrays = await Promise.all(eventPromises)
            const events = eventArrays.flat()
            logger.debug('[ProfileBookmarksAndHashtags] Fetched', events.length, 'pin events')
            
            if (isRefresh) {
              // For refresh, append new events and deduplicate
              setPinEvents(prevEvents => {
                const existingIds = new Set(prevEvents.map(e => e.id))
                const newEvents = events.filter(event => !existingIds.has(event.id))
                const combinedEvents = [...newEvents, ...prevEvents]
                // Re-sort the combined events
                return combinedEvents.sort((a, b) => b.created_at - a.created_at)
              })
            } else {
              setPinEvents(events)
            }
          } catch (error) {
            logger.warn('[ProfileBookmarksAndHashtags] Error fetching pin events:', error)
            setPinEvents([])
          }
        } else {
          setPinEvents([])
        }
      } else {
        setPinEvents([])
      }
      
      // Reset retry count on successful fetch
      if (isRetry) {
        setRetryCountPins(0)
      }
    } catch (error) {
      logger.component('ProfileBookmarksAndHashtags', 'Error fetching pins', { error: (error as Error).message, retryCount: isRetry ? retryCountPins + 1 : 0 })
      
      // If this is not a retry and we haven't exceeded max retries, schedule a retry
      if (!isRetry && retryCountPins < maxRetries) {
        console.log('[ProfileBookmarksAndHashtags] Scheduling pin retry', retryCountPins + 1, 'of', maxRetries)
        // Use shorter delays for initial retries, then exponential backoff
        const delay = retryCountPins === 0 ? 1000 : retryCountPins === 1 ? 2000 : 3000
        setTimeout(() => {
          setRetryCountPins(prev => prev + 1)
          fetchPins(true)
        }, delay)
      } else {
        setPinEvents([])
      }
    } finally {
      setLoadingPins(false)
      setIsRetryingPins(false)
      if (isRefresh) {
        setIsRefreshing(false)
      }
    }
  }, [pubkey, buildComprehensiveRelayList, retryCountPins, maxRetries])


  // Expose refresh function to parent component
  const refresh = useCallback(() => {
    setRetryCountBookmarks(0)
    setRetryCountHashtags(0)
    setRetryCountPins(0)
    setIsRefreshing(true)
    fetchBookmarks(false, true) // isRetry = false, isRefresh = true
    fetchHashtags(false, true) // isRetry = false, isRefresh = true
    fetchPins(false, true) // isRetry = false, isRefresh = true
  }, [fetchBookmarks, fetchHashtags, fetchPins])

  useImperativeHandle(ref, () => ({
    refresh
  }), [refresh])

  // Fetch data when component mounts or pubkey changes - delay slightly to avoid race conditions
  useEffect(() => {
    if (pubkey) {
      // Small delay to stagger initial fetches and allow relay list cache to populate
      const timeoutId = setTimeout(() => {
        fetchBookmarks()
        fetchHashtags()
        fetchPins()
      }, 200) // 200ms delay (longest since this component does 3 fetches) to allow previous fetches to populate cache
      return () => clearTimeout(timeoutId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey]) // Only depend on pubkey - fetch functions are stable from useCallback

  // Check if the requested tab has content
  const hasContent = useMemo(() => {
    switch (initialTab) {
      case 'pins':
        return pinListEvent || loadingPins
      case 'bookmarks':
        return bookmarkListEvent || loadingBookmarks
      case 'hashtags':
        return interestListEvent || loadingHashtags
      default:
        return false
    }
  }, [initialTab, pinListEvent, bookmarkListEvent, interestListEvent, loadingPins, loadingBookmarks, loadingHashtags])

  // Render loading state for the specific tab
  const isLoading = useMemo(() => {
    switch (initialTab) {
      case 'pins':
        return loadingPins || isRetryingPins
      case 'bookmarks':
        return loadingBookmarks || isRetryingBookmarks
      case 'hashtags':
        return loadingHashtags || isRetryingHashtags
      default:
        return false
    }
  }, [initialTab, loadingPins, loadingBookmarks, loadingHashtags, isRetryingPins, isRetryingBookmarks, isRetryingHashtags])

  // Get retry info for current tab
  const getRetryInfo = () => {
    switch (initialTab) {
      case 'pins':
        return { isRetrying: isRetryingPins, retryCount: retryCountPins }
      case 'bookmarks':
        return { isRetrying: isRetryingBookmarks, retryCount: retryCountBookmarks }
      case 'hashtags':
        return { isRetrying: isRetryingHashtags, retryCount: retryCountHashtags }
      default:
        return { isRetrying: false, retryCount: 0 }
    }
  }

  const { isRetrying, retryCount } = getRetryInfo()

  // Filter events based on search query for each tab
  const filteredBookmarkEvents = useMemo(() => {
    if (!searchQuery.trim()) return bookmarkEvents
    
    const query = searchQuery.toLowerCase()
    return bookmarkEvents.filter(event => 
      event.content.toLowerCase().includes(query) ||
      event.tags.some(tag => 
        tag.length > 1 && tag[1]?.toLowerCase().includes(query)
      )
    )
  }, [bookmarkEvents, searchQuery])

  const filteredHashtagEvents = useMemo(() => {
    if (!searchQuery.trim()) return hashtagEvents
    
    const query = searchQuery.toLowerCase()
    return hashtagEvents.filter(event => 
      event.content.toLowerCase().includes(query) ||
      event.tags.some(tag => 
        tag.length > 1 && tag[1]?.toLowerCase().includes(query)
      )
    )
  }, [hashtagEvents, searchQuery])

  const filteredPinEvents = useMemo(() => {
    if (!searchQuery.trim()) return pinEvents
    
    const query = searchQuery.toLowerCase()
    return pinEvents.filter(event => 
      event.content.toLowerCase().includes(query) ||
      event.tags.some(tag => 
        tag.length > 1 && tag[1]?.toLowerCase().includes(query)
      )
    )
  }, [pinEvents, searchQuery])

  if (isLoading) {
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

  // If no content available for this tab, don't render anything
  if (!hasContent) {
    return null
  }

  // Render content based on initial tab
  const renderContent = () => {
    if (initialTab === 'pins') {
      if (isRefreshing) {
        return (
          <div className="px-4 py-2 text-sm text-green-500 text-center">
            🔄 Refreshing pins...
          </div>
        )
      }
      if (loadingPins) {
        return (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )
      }
      
      if (pinEvents.length === 0) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            {t('No pins found')}
          </div>
        )
      }

      if (filteredPinEvents.length === 0 && searchQuery.trim()) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            No pins match your search
          </div>
        )
      }
      
      return (
        <div className="min-h-screen">
          {searchQuery.trim() && (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {filteredPinEvents.length} of {pinEvents.length} pins
            </div>
          )}
          <div className="space-y-2">
            {filteredPinEvents.map((event) => (
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
    
    if (initialTab === 'bookmarks') {
      if (isRefreshing) {
        return (
          <div className="px-4 py-2 text-sm text-green-500 text-center">
            🔄 Refreshing bookmarks...
          </div>
        )
      }
      if (loadingBookmarks) {
        return (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )
      }
      
      if (bookmarkEvents.length === 0) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            {t('No bookmarks found')}
          </div>
        )
      }

      if (filteredBookmarkEvents.length === 0 && searchQuery.trim()) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            No bookmarks match your search
          </div>
        )
      }
      
      return (
        <div className="min-h-screen">
          {searchQuery.trim() && (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {filteredBookmarkEvents.length} of {bookmarkEvents.length} bookmarks
            </div>
          )}
          <div className="space-y-2">
            {filteredBookmarkEvents.map((event) => (
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
    
    if (initialTab === 'hashtags') {
      if (isRefreshing) {
        return (
          <div className="px-4 py-2 text-sm text-green-500 text-center">
            🔄 Refreshing interests...
          </div>
        )
      }
      if (loadingHashtags) {
        return (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        )
      }
      
      if (hashtagEvents.length === 0) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            {t('No interest-related content found')}
          </div>
        )
      }

      if (filteredHashtagEvents.length === 0 && searchQuery.trim()) {
        return (
          <div className="text-center py-8 text-muted-foreground">
            No interests match your search
          </div>
        )
      }
      
      return (
        <div className="min-h-screen">
          {searchQuery.trim() && (
            <div className="px-4 py-2 text-sm text-muted-foreground">
              {filteredHashtagEvents.length} of {hashtagEvents.length} interests
            </div>
          )}
          <div className="space-y-2">
            {filteredHashtagEvents.map((event) => (
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
    
    return null
  }

  return renderContent()
})

ProfileBookmarksAndHashtags.displayName = 'ProfileBookmarksAndHashtags'

export default ProfileBookmarksAndHashtags
