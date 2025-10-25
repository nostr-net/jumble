import KindFilter from '@/components/KindFilter'
import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import { BIG_RELAY_URLS } from '@/constants'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
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
      const userRelays = [...myRelayList.read, ...BIG_RELAY_URLS]

      if (listMode === 'you') {
        if (!myPubkey) {
          setSubRequests([])
          return
        }

        setSubRequests([
          {
            urls: userRelays.slice(0, 5),
            filter: {
              authors: [myPubkey],
              '#p': [pubkey]
            }
          },
          {
            urls: userRelays.slice(0, 5),
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
          urls: userRelays.slice(0, 8),
          filter: {
            authors: [pubkey]
          }
        }
      ])
    }
    init()
  }, [pubkey, listMode, myPubkey])

  // Fetch pinned notes
  useEffect(() => {
    const fetchPinnedNotes = async () => {
      setLoadingPinned(true)
      try {
        const pinListEvent = await client.fetchPinListEvent(pubkey)
        if (pinListEvent && pinListEvent.tags.length > 0) {
          // Extract event IDs from pin list
          const eventIds = pinListEvent.tags
            .filter(tag => tag[0] === 'e' && tag[1])
            .map(tag => tag[1])
            .reverse() // Reverse to show newest first
          
          // Fetch the actual events
          const events = await client.fetchEvents(
            [...BIG_RELAY_URLS],
            { ids: eventIds }
          )
          
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
  }, [pubkey])

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
