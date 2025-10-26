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
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RefreshButton } from '../RefreshButton'
import ProfileBookmarksAndHashtags from './ProfileBookmarksAndHashtags'

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
  const [listMode, setListMode] = useState<TNoteListMode>('bookmarksAndHashtags')
  const noteListRef = useRef<TNoteListRef>(null)
  const [subRequests, setSubRequests] = useState<TFeedSubRequest[]>([])
  
  const tabs = useMemo(() => {
    const _tabs = [
      { value: 'bookmarksAndHashtags', label: 'Interests' },
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
      
      // Build comprehensive relay list: prioritize write relays when viewing own profile
      const isOwnProfile = myPubkey === pubkey
      const allRelays = isOwnProfile ? [
        // For own profile: prioritize write relays first to find own responses
        ...(myRelayList.write || []), // User's outboxes (kind 10002) - PRIORITY
        ...(myRelayList.read || []), // User's inboxes (kind 10002)
        ...(favoriteRelays || []), // User's favorite relays (kind 10012)
        ...FAST_WRITE_RELAY_URLS,   // Fast write relays - PRIORITY
        ...BIG_RELAY_URLS,         // Big relays
        ...FAST_READ_RELAY_URLS    // Fast read relays
      ] : [
        // For other profiles: use standard order
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
      
      // Debug: Log relay usage for own profile to help troubleshoot missing responses
      if (isOwnProfile) {
        console.log('[ProfileFeed] Using', userRelays.length, 'relays for OWN profile (prioritizing write relays):', userRelays)
        console.log('[ProfileFeed] Write relays:', myRelayList.write)
        console.log('[ProfileFeed] Read relays:', myRelayList.read)
      }

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


  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop()
  }

  // Pinned notes are now handled in the Interests tab

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
          listMode !== 'bookmarksAndHashtags' ? (
            <>
              {!supportTouch && <RefreshButton onClick={() => noteListRef.current?.refresh()} />}
              <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
            </>
          ) : undefined
        }
      />
      {listMode === 'bookmarksAndHashtags' ? (
        <ProfileBookmarksAndHashtags pubkey={pubkey} topSpace={topSpace} />
      ) : (
        <NoteList
          ref={noteListRef}
          subRequests={subRequests}
          showKinds={temporaryShowKinds}
          hideReplies={listMode === 'posts'}
          filterMutedNotes={false}
        />
      )}
    </>
  )
}
