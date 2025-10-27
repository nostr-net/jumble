import KindFilter from '@/components/KindFilter'
import SimpleNoteFeed from '@/components/SimpleNoteFeed'
import Tabs from '@/components/Tabs'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useNostr } from '@/providers/NostrProvider'
import { TNoteListMode } from '@/types'
import { useMemo, useRef, useState } from 'react'
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
  const { showKinds } = useKindFilter()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>('bookmarksAndHashtags')
  const simpleNoteFeedRef = useRef<{ refresh: () => void }>(null)
  
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

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
  }

  // Determine the authors filter based on list mode
  const getAuthorsFilter = () => {
    if (listMode === 'you') {
      if (!myPubkey) return []
      return [myPubkey, pubkey] // Show interactions between current user and profile user
    }
    return [pubkey] // Show only profile user's events
  }

  // Determine if we should hide replies
  const shouldHideReplies = listMode === 'posts'

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
              {!supportTouch && <RefreshButton onClick={() => simpleNoteFeedRef.current?.refresh()} />}
              <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
            </>
          ) : undefined
        }
      />
      {listMode === 'bookmarksAndHashtags' ? (
        <ProfileBookmarksAndHashtags pubkey={pubkey} topSpace={topSpace} />
      ) : (
        <SimpleNoteFeed
          ref={simpleNoteFeedRef}
          authors={getAuthorsFilter()}
          kinds={temporaryShowKinds}
          limit={100}
          hideReplies={shouldHideReplies}
          filterMutedNotes={false}
        />
      )}
    </>
  )
}
