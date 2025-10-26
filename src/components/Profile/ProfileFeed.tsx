import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'
import { Event } from 'nostr-tools'
import NoteCard from '../NoteCard'

export default function ProfileFeed({
  pubkey,
  topSpace = 0
}: {
  pubkey: string
  topSpace?: number
}) {
  const { pubkey: myPubkey } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const { showKinds } = useKindFilter()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => storage.getNoteListMode())
  const noteListRef = useRef<TNoteListRef>(null)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  const [pinnedEvents, setPinnedEvents] = useState<Event[]>([])
  const [loadingPinned, setLoadingPinned] = useState(true)
  
  const tabs = useMemo(() => {
    const _tabs = [
      { value: 'posts', label: 'Notes' },
      { value: 'postsAndReplies', label: 'Replies' }
    ]

    if (myPubkey && myPubkey !== pubkey) {
      _tabs.push({ value: 'you', label: 'YouTabName' })
    }

    return _tabs
  }, [myPubkey, pubkey])
  const supportTouch = useMemo(() => isTouchDevice(), [])

  useEffect(() => {
    const init = async () => {
      // Privacy: Only use user's own relays + defaults, never connect to other users' relays
      const myRelayList = myPubkey ? await client.fetchRelayList(myPubkey) : { write: [], read: [] }
      
      // Build comprehensive relay list: user's inboxes + user's favorite relays + big relays + fast read relays + fast write relays
      const allRelays = [
        ...(myRelayList.read || []), // User's inboxes (kind 10002)
        ...(myRelayList.write || []), // User's outboxes (kind 10002)
        ...(favoriteRelays || []), // User's favorite relays (kind 10012)
        ...BIG_RELAY_URLS,         // Big relays
        ...FAST_READ_RELAY_URLS,   // Fast read relays
        ...FAST_WRITE_RELAY_URLS   // Fast write relays
      ]
      
      // Normalize and deduplicate relay URLs
      const normalizedRelays = allRelays
        .map(url => normalizeUrl(url))
        .filter((url): url is string => !!url)
      
      const userRelays = Array.from(new Set(normalizedRelays))
      console.log('[ProfileFeed] Using', userRelays.length, 'relays for profile feed:', userRelays)

      if (listMode === 'you') {
        if (!myPubkey) {
          setSubRequests([])
          return
        }

        setSubRequests([
          {
            urls: userRelays,
            filter: {
              authors: [myPubkey],
              '#p': [pubkey]
            }
          },
          {
            urls: userRelays,
            filter: {
              authors: [pubkey],
              '#p': [myPubkey]
            }
          }
        ])
        return
      }

      setSubRequests([
        {
          urls: userRelays,
          filter: {
            authors: [pubkey]
          }
        }
      ])
    }
    init()
  }, [pubkey, listMode, myPubkey, favoriteRelays])

  // Fetch pinned notes
  useEffect(() => {
    const fetchPinnedNotes = async () => {
      setLoadingPinned(true)
      try {
        // Build comprehensive relay list for fetching pin list event
        const myRelayList = myPubkey ? await client.fetchRelayList(myPubkey) : { write: [], read: [] }
        const allRelaysForPinList = [
          ...(myRelayList.read || []), // User's inboxes (kind 10002)
          ...(myRelayList.write || []), // User's outboxes (kind 10002)
          ...(favoriteRelays || []), // User's favorite relays (kind 10012)
          ...BIG_RELAY_URLS,         // Big relays
          ...FAST_READ_RELAY_URLS,   // Fast read relays
          ...FAST_WRITE_RELAY_URLS   // Fast write relays
        ]
        
        const normalizedRelaysForPinList = allRelaysForPinList
          .map(url => normalizeUrl(url))
          .filter((url): url is string => !!url)
        
        const comprehensiveRelaysForPinList = Array.from(new Set(normalizedRelaysForPinList))
        console.log('[ProfileFeed] Using', comprehensiveRelaysForPinList.length, 'relays for pin list event:', comprehensiveRelaysForPinList)
        console.log('[ProfileFeed] Relay breakdown - inboxes:', myRelayList.read?.length || 0, 'outboxes:', myRelayList.write?.length || 0, 'favorites:', favoriteRelays?.length || 0, 'big:', BIG_RELAY_URLS.length, 'fast_read:', FAST_READ_RELAY_URLS.length, 'fast_write:', FAST_WRITE_RELAY_URLS.length)
        
        // Try to fetch pin list event from comprehensive relay list first
        let pinListEvent = null
        try {
          const pinListEvents = await client.fetchEvents(comprehensiveRelaysForPinList, {
            authors: [pubkey],
            kinds: [10001], // Pin list kind
            limit: 1
          })
          pinListEvent = pinListEvents[0] || null
        } catch (error) {
          console.warn('[ProfileFeed] Error fetching pin list from comprehensive relays, falling back to default method:', error)
          pinListEvent = await client.fetchPinListEvent(pubkey)
        }
        
        console.log('[ProfileFeed] Pin list event:', pinListEvent)
        if (pinListEvent && pinListEvent.tags.length > 0) {
          // Extract event IDs from pin list
          const eventIds = pinListEvent.tags
            .filter(tag => tag[0] === 'e' && tag[1])
            .map(tag => tag[1])
            .reverse() // Reverse to show newest first
          
          console.log('[ProfileFeed] Found', eventIds.length, 'pinned event IDs:', eventIds)
          
          // Use the same comprehensive relay list we built for the pin list event
          console.log('[ProfileFeed] Using', comprehensiveRelaysForPinList.length, 'relays for pinned notes:', comprehensiveRelaysForPinList)
          
          // Fetch the actual events
          const events = await client.fetchEvents(
            comprehensiveRelaysForPinList,
            { ids: eventIds }
          )
          
          console.log('[ProfileFeed] Fetched', events.length, 'pinned events out of', eventIds.length, 'requested')
          console.log('[ProfileFeed] Fetched events:', events.map(e => ({ id: e.id, content: e.content.substring(0, 50) + '...' })))
          
          // Debug: Check which event IDs were not found
          const foundEventIds = events.map(e => e.id)
          const missingEventIds = eventIds.filter(id => !foundEventIds.includes(id))
          if (missingEventIds.length > 0) {
            console.log('[ProfileFeed] Missing event IDs that could not be fetched:', missingEventIds)
            
            // Try to fetch missing events individually to see if any specific relay has them
            for (const missingId of missingEventIds) {
              try {
                console.log('[ProfileFeed] Attempting to fetch missing event:', missingId)
                const missingEvents = await client.fetchEvents(comprehensiveRelaysForPinList, {
                  ids: [missingId],
                  limit: 1
                })
                if (missingEvents.length > 0) {
                  console.log('[ProfileFeed] Successfully fetched missing event:', missingId, missingEvents[0].content.substring(0, 50) + '...')
                } else {
                  console.log('[ProfileFeed] Missing event not found on any relay:', missingId)
                }
              } catch (error) {
                console.error('[ProfileFeed] Error fetching missing event:', missingId, error)
              }
            }
          }
          
          // Sort by created_at desc (newest first)
          const sortedEvents = events.sort((a, b) => b.created_at - a.created_at)
          setPinnedEvents(sortedEvents)
        } else {
          setPinnedEvents([])
        }
      } catch (error) {
        console.error('Error fetching pinned notes:', error)
        setPinnedEvents([])
      } finally {
        setLoadingPinned(false)
      }
    }
    
    fetchPinnedNotes()
  }, [pubkey, myPubkey, favoriteRelays])

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop()
  }

  // Create pinned notes header
  const pinnedHeader = useMemo(() => {
    if (loadingPinned || pinnedEvents.length === 0) return null
    
    return (
      <div className="border-b border-border">
        <div className="px-4 py-2 bg-muted/30 text-sm font-semibold text-muted-foreground">
          Pinned
        </div>
        {pinnedEvents.map((event) => (
          <NoteCard
            key={event.id}
            className="w-full border-b border-border"
            event={event}
            filterMutedNotes={false}
          />
        ))}
      </div>
    )
  }, [pinnedEvents, loadingPinned])

  return (
    <>
      <Tabs
        value={listMode}
        tabs={tabs}
        onTabChange={(listMode) => {
          handleListModeChange(listMode as TNoteListMode)
        }}
        threshold={Math.max(800, topSpace)}
        options={
          <>
            {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
            <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
          </>
        }
      />
      <NoteList
        ref={noteListRef}
        subRequests={subRequests}
        showKinds={temporaryShowKinds}
        hideReplies={listMode === 'posts'}
        filterMutedNotes={false}
        customHeader={pinnedHeader}
      />
    </>
  )
}
