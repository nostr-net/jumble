import { Event } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import client from '@/services/client.service'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'
import NoteCard from '../NoteCard'
import { Skeleton } from '../ui/skeleton'
import Tabs from '../Tabs'

type TabValue = 'bookmarks' | 'hashtags' | 'pins'

export default function ProfileBookmarksAndHashtags({
  pubkey,
  topSpace = 0
}: {
  pubkey: string
  topSpace?: number
}) {
  const { t } = useTranslation()
  const { pubkey: myPubkey } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const [activeTab, setActiveTab] = useState<TabValue>('pins')
  const [bookmarkEvents, setBookmarkEvents] = useState<Event[]>([])
  const [hashtagEvents, setHashtagEvents] = useState<Event[]>([])
  const [pinEvents, setPinEvents] = useState<Event[]>([])
  const [loadingBookmarks, setLoadingBookmarks] = useState(true)
  const [loadingHashtags, setLoadingHashtags] = useState(true)
  const [loadingPins, setLoadingPins] = useState(true)
  const [bookmarkListEvent, setBookmarkListEvent] = useState<Event | null>(null)
  const [interestListEvent, setInterestListEvent] = useState<Event | null>(null)
  const [pinListEvent, setPinListEvent] = useState<Event | null>(null)

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
    console.log('[ProfileBookmarksAndHashtags] Using', comprehensiveRelays.length, 'relays for bookmark/interest list events:', comprehensiveRelays)
    console.log('[ProfileBookmarksAndHashtags] Relay breakdown - inboxes:', myRelayList.read?.length || 0, 'outboxes:', myRelayList.write?.length || 0, 'favorites:', favoriteRelays?.length || 0, 'big:', BIG_RELAY_URLS.length, 'fast_read:', FAST_READ_RELAY_URLS.length, 'fast_write:', FAST_WRITE_RELAY_URLS.length)
    
    return comprehensiveRelays
  }, [myPubkey, favoriteRelays])

  // Fetch bookmark list event and associated events
  const fetchBookmarks = useCallback(async () => {
    setLoadingBookmarks(true)
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
        console.warn('[ProfileBookmarksAndHashtags] Error fetching bookmark list from comprehensive relays, falling back to default method:', error)
        bookmarkList = await client.fetchBookmarkListEvent(pubkey)
      }
      
      console.log('[ProfileBookmarksAndHashtags] Bookmark list event:', bookmarkList)
      setBookmarkListEvent(bookmarkList)
      
      if (bookmarkList && bookmarkList.tags.length > 0) {
        // Extract event IDs from bookmark list
        const eventIds = bookmarkList.tags
          .filter(tag => tag[0] === 'e' && tag[1])
          .map(tag => tag[1])
          .reverse() // Reverse to show newest first
        
        console.log('[ProfileBookmarksAndHashtags] Found', eventIds.length, 'bookmark event IDs:', eventIds)
        
        if (eventIds.length > 0) {
          try {
            // Use the same comprehensive relay list we built for the bookmark list event
            const events = await client.fetchEvents(comprehensiveRelays, {
              ids: eventIds,
              limit: 500
            })
            console.log('[ProfileBookmarksAndHashtags] Fetched', events.length, 'bookmark events')
            setBookmarkEvents(events)
          } catch (error) {
            console.warn('[ProfileBookmarksAndHashtags] Error fetching bookmark events:', error)
            setBookmarkEvents([])
          }
        } else {
          setBookmarkEvents([])
        }
      } else {
        setBookmarkEvents([])
      }
    } catch (error) {
      console.error('[ProfileBookmarksAndHashtags] Error fetching bookmarks:', error)
      setBookmarkEvents([])
    } finally {
      setLoadingBookmarks(false)
    }
  }, [pubkey, buildComprehensiveRelayList])

  // Fetch interest list event and associated events
  const fetchHashtags = useCallback(async () => {
    setLoadingHashtags(true)
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
        console.warn('[ProfileBookmarksAndHashtags] Error fetching interest list from comprehensive relays, falling back to default method:', error)
        interestList = await client.fetchInterestListEvent(pubkey)
      }
      
      console.log('[ProfileBookmarksAndHashtags] Interest list event:', interestList)
      setInterestListEvent(interestList)
      
      if (interestList && interestList.tags.length > 0) {
        // Extract hashtags from interest list
        const hashtags = interestList.tags
          .filter(tag => tag[0] === 't' && tag[1])
          .map(tag => tag[1])
        
        console.log('[ProfileBookmarksAndHashtags] Found', hashtags.length, 'interest hashtags:', hashtags)
        
        if (hashtags.length > 0) {
          try {
            // Fetch recent events with these hashtags using the same comprehensive relay list
            const events = await client.fetchEvents(comprehensiveRelays, {
              kinds: [1], // Text notes
              '#t': hashtags,
              limit: 100
            })
            console.log('[ProfileBookmarksAndHashtags] Fetched', events.length, 'hashtag events')
            setHashtagEvents(events)
          } catch (error) {
            console.warn('[ProfileBookmarksAndHashtags] Error fetching hashtag events:', error)
            setHashtagEvents([])
          }
        } else {
          setHashtagEvents([])
        }
      } else {
        setHashtagEvents([])
      }
    } catch (error) {
      console.error('[ProfileBookmarksAndHashtags] Error fetching hashtags:', error)
      setHashtagEvents([])
    } finally {
      setLoadingHashtags(false)
    }
  }, [pubkey, buildComprehensiveRelayList])

  // Fetch pin list event and associated events
  const fetchPins = useCallback(async () => {
    setLoadingPins(true)
    try {
      const comprehensiveRelays = await buildComprehensiveRelayList()
      
      // Try to fetch pin list event from comprehensive relay list first
      let pinList = null
      try {
        const pinListEvents = await client.fetchEvents(comprehensiveRelays, {
          authors: [pubkey],
          kinds: [10001], // Pin list kind
          limit: 1
        })
        pinList = pinListEvents[0] || null
      } catch (error) {
        console.warn('[ProfileBookmarksAndHashtags] Error fetching pin list from comprehensive relays, falling back to default method:', error)
        pinList = await client.fetchPinListEvent(pubkey)
      }
      
      console.log('[ProfileBookmarksAndHashtags] Pin list event:', pinList)
      setPinListEvent(pinList)
      
      if (pinList && pinList.tags.length > 0) {
        // Extract event IDs from pin list
        const eventIds = pinList.tags
          .filter(tag => tag[0] === 'e' && tag[1])
          .map(tag => tag[1])
          .reverse() // Reverse to show newest first
        
        console.log('[ProfileBookmarksAndHashtags] Found', eventIds.length, 'pin event IDs:', eventIds)
        
        if (eventIds.length > 0) {
          try {
            // Use the same comprehensive relay list we built for the pin list event
            const events = await client.fetchEvents(comprehensiveRelays, {
              ids: eventIds,
              limit: 500
            })
            console.log('[ProfileBookmarksAndHashtags] Fetched', events.length, 'pin events')
            setPinEvents(events)
          } catch (error) {
            console.warn('[ProfileBookmarksAndHashtags] Error fetching pin events:', error)
            setPinEvents([])
          }
        } else {
          setPinEvents([])
        }
      } else {
        setPinEvents([])
      }
    } catch (error) {
      console.error('[ProfileBookmarksAndHashtags] Error fetching pins:', error)
      setPinEvents([])
    } finally {
      setLoadingPins(false)
    }
  }, [pubkey, buildComprehensiveRelayList])

  // Fetch data when component mounts or pubkey changes
  useEffect(() => {
    fetchBookmarks()
    fetchHashtags()
    fetchPins()
  }, [fetchBookmarks, fetchHashtags, fetchPins])

  // Define tabs
  const tabs = useMemo(() => {
    const _tabs = []
    
    // Only show pins tab if user has pin list (first/leftmost)
    if (pinListEvent || loadingPins) {
      _tabs.push({
        value: 'pins',
        label: t('Pins')
      })
    }
    
    // Only show bookmarks tab if user has bookmarks
    if (bookmarkListEvent || loadingBookmarks) {
      _tabs.push({
        value: 'bookmarks',
        label: t('Bookmarks')
      })
    }
    
    // Only show hashtags tab if user has interest list
    if (interestListEvent || loadingHashtags) {
      _tabs.push({
        value: 'hashtags',
        label: t('Hashtags')
      })
    }
    
    return _tabs
  }, [bookmarkListEvent, interestListEvent, pinListEvent, loadingBookmarks, loadingHashtags, loadingPins, t])

  // Render loading state
  if (loadingBookmarks && loadingHashtags && loadingPins) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // If no tabs available, don't render anything
  if (tabs.length === 0) {
    return null
  }

  // Render content based on active tab
  const renderContent = () => {
    if (activeTab === 'pins') {
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
      
      return (
        <div className="space-y-2">
          {pinEvents.map((event) => (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={false}
            />
          ))}
        </div>
      )
    }
    
    if (activeTab === 'bookmarks') {
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
      
      return (
        <div className="space-y-2">
          {bookmarkEvents.map((event) => (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={false}
            />
          ))}
        </div>
      )
    }
    
    if (activeTab === 'hashtags') {
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
      
      return (
        <div className="space-y-2">
          {hashtagEvents.map((event) => (
            <NoteCard
              key={event.id}
              className="w-full"
              event={event}
              filterMutedNotes={false}
            />
          ))}
        </div>
      )
    }
    
    return null
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={activeTab}
        tabs={tabs}
        onTabChange={(tab) => setActiveTab(tab as TabValue)}
        threshold={Math.max(800, topSpace)}
      />
      {renderContent()}
    </div>
  )
}
