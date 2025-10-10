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
      const userRelays = myRelayList.read.concat(BIG_RELAY_URLS)

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

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    noteListRef.current?.scrollToTop('smooth')
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    noteListRef.current?.scrollToTop()
  }

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
      />
    </>
  )
}
