import NoteList, { TNoteListRef } from '@/components/NoteList'
import Tabs from '@/components/Tabs'
import logger from '@/lib/logger'
import { isTouchDevice } from '@/lib/utils'
import { useKindFilter } from '@/providers/KindFilterProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import storage from '@/services/local-storage.service'
import { TFeedSubRequest, TNoteListMode } from '@/types'
import { forwardRef, useMemo, useRef, useState } from 'react'
import KindFilter from '../KindFilter'
import { RefreshButton } from '../RefreshButton'

const NormalFeed = forwardRef<TNoteListRef, {
  subRequests: TFeedSubRequest[]
  areAlgoRelays?: boolean
  isMainFeed?: boolean
  showRelayCloseReason?: boolean
}>(function NormalFeed({
  subRequests,
  areAlgoRelays = false,
  isMainFeed = false,
  showRelayCloseReason = false
}, ref) {
  logger.debug('NormalFeed component rendering with:', { subRequests, areAlgoRelays, isMainFeed })
  const { hideUntrustedNotes } = useUserTrust()
  const { showKinds } = useKindFilter()
  const [temporaryShowKinds, setTemporaryShowKinds] = useState(showKinds)
  const [listMode, setListMode] = useState<TNoteListMode>(() => {
    const storedMode = storage.getNoteListMode()
    // Default to 'posts' (Notes tab) for main feed, not replies
    return storedMode || 'posts'
  })
  const supportTouch = useMemo(() => isTouchDevice(), [])
  const internalNoteListRef = useRef<TNoteListRef>(null)
  const noteListRef = ref || internalNoteListRef

  const handleListModeChange = (mode: TNoteListMode) => {
    setListMode(mode)
    if (isMainFeed) {
      storage.setNoteListMode(mode)
    }
    if (noteListRef && typeof noteListRef !== 'function') {
      noteListRef.current?.scrollToTop('smooth')
    }
  }

  const handleShowKindsChange = (newShowKinds: number[]) => {
    setTemporaryShowKinds(newShowKinds)
    if (noteListRef && typeof noteListRef !== 'function') {
      noteListRef.current?.scrollToTop()
    }
  }

  return (
    <>
      <Tabs
        value={listMode}
        tabs={[
          { value: 'posts', label: 'Notes' },
          { value: 'postsAndReplies', label: 'Replies' }
        ]}
        onTabChange={(listMode) => {
          handleListModeChange(listMode as TNoteListMode)
        }}
        options={
          <>
            {!supportTouch && <RefreshButton onClick={() => {
              if (noteListRef && typeof noteListRef !== 'function') {
                noteListRef.current?.refresh()
              }
            }} />}
            <KindFilter showKinds={temporaryShowKinds} onShowKindsChange={handleShowKindsChange} />
          </>
        }
      />
      <NoteList
        ref={noteListRef}
        showKinds={temporaryShowKinds}
        subRequests={subRequests}
        hideReplies={listMode === 'posts'}
        hideUntrustedNotes={hideUntrustedNotes}
        areAlgoRelays={areAlgoRelays}
        showRelayCloseReason={showRelayCloseReason}
      />
    </>
  )
})

export default NormalFeed
