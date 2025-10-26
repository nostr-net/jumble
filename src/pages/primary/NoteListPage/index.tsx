import { useSecondaryPage } from '@/PageManager'
import BookmarkList from '@/components/BookmarkList'
import PostEditor from '@/components/PostEditor'
import RelayInfo from '@/components/RelayInfo'
import { Button } from '@/components/ui/button'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { toSearch } from '@/lib/link'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { TPageRef } from '@/types'
import { Info, PencilLine, Search } from 'lucide-react'
import {
  Dispatch,
  forwardRef,
  SetStateAction,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import FeedButton from './FeedButton'
import ExploreButton from '@/components/Titlebar/ExploreButton'
import AccountButton from '@/components/Titlebar/AccountButton'
import FollowingFeed from './FollowingFeed'
import RelaysFeed from './RelaysFeed'
import logger from '@/lib/logger'

const NoteListPage = forwardRef((_, ref) => {
  logger.debug('NoteListPage component rendering')
  const { t } = useTranslation()
  const { addRelayUrls, removeRelayUrls } = useCurrentRelays()
  const layoutRef = useRef<TPageRef>(null)
  const { pubkey, checkLogin } = useNostr()
  const { feedInfo, relayUrls, isReady } = useFeed()
  const [showRelayDetails, setShowRelayDetails] = useState(false)
  useImperativeHandle(ref, () => layoutRef.current)

  useEffect(() => {
    if (layoutRef.current) {
      layoutRef.current.scrollToTop('instant')
    }
  }, [JSON.stringify(relayUrls), feedInfo])

  useEffect(() => {
    if (relayUrls.length) {
      addRelayUrls(relayUrls)
      return () => {
        removeRelayUrls(relayUrls)
      }
    }
  }, [relayUrls])

  // Debug logging
  logger.debug('NoteListPage debug:', {
    isReady,
    feedInfo,
    relayUrls,
    pubkey: !!pubkey
  })

  let content: React.ReactNode = null
  if (!isReady) {
    content = <div className="text-center text-sm text-muted-foreground">{t('loading...')}</div>
  } else if (feedInfo.feedType === 'following' && !pubkey) {
    content = (
      <div className="flex justify-center w-full">
        <Button size="lg" onClick={() => checkLogin()}>
          {t('Please login to view following feed')}
        </Button>
      </div>
    )
  } else if (feedInfo.feedType === 'bookmarks') {
    if (!pubkey) {
      content = (
        <div className="flex justify-center w-full">
          <Button size="lg" onClick={() => checkLogin()}>
            {t('Please login to view bookmarks')}
          </Button>
        </div>
      )
    } else {
      content = <BookmarkList />
    }
  } else if (feedInfo.feedType === 'following') {
    content = <FollowingFeed />
  } else {
    content = (
      <>
        {showRelayDetails && feedInfo.feedType === 'relay' && !!feedInfo.id && (
          <RelayInfo url={feedInfo.id!} className="mb-2 pt-3" />
        )}
        <RelaysFeed />
      </>
    )
  }

  return (
    <PrimaryPageLayout
      pageName="home"
      ref={layoutRef}
      titlebar={
        <NoteListPageTitlebar
          layoutRef={layoutRef}
          showRelayDetails={showRelayDetails}
          setShowRelayDetails={
            feedInfo.feedType === 'relay' && !!feedInfo.id ? setShowRelayDetails : undefined
          }
        />
      }
      displayScrollToTopButton
    >
      {content}
    </PrimaryPageLayout>
  )
})
NoteListPage.displayName = 'NoteListPage'
export default NoteListPage

function NoteListPageTitlebar({
  layoutRef,
  showRelayDetails,
  setShowRelayDetails
}: {
  layoutRef?: React.RefObject<TPageRef>
  showRelayDetails?: boolean
  setShowRelayDetails?: Dispatch<SetStateAction<boolean>>
}) {
  const { isSmallScreen } = useScreenSize()

  return (
    <div className="relative flex gap-1 items-center h-full justify-between">
      <div className="flex gap-1 items-center">
        <ExploreButton />
        <FeedButton className="flex-1 max-w-fit w-0" />
      </div>
      {isSmallScreen && (
        <div className="absolute left-1/2 transform -translate-x-1/2">
          <div className="text-green-600 dark:text-green-500 font-semibold text-sm">
            Im Wald
          </div>
        </div>
      )}
      <div className="shrink-0 flex gap-1 items-center">
        {setShowRelayDetails && (
          <Button
            variant="ghost"
            size="titlebar-icon"
            onClick={(e) => {
              e.stopPropagation()
              setShowRelayDetails((show) => !show)

              if (!showRelayDetails) {
                layoutRef?.current?.scrollToTop('smooth')
              }
            }}
            className={showRelayDetails ? 'bg-accent/50' : ''}
          >
            <Info />
          </Button>
        )}
        {isSmallScreen && (
          <>
            <SearchButton />
            <PostButton />
          </>
        )}
        <AccountButton />
      </div>
    </div>
  )
}

function PostButton() {
  const { checkLogin } = useNostr()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="ghost"
        size="titlebar-icon"
        onClick={(e) => {
          e.stopPropagation()
          checkLogin(() => {
            setOpen(true)
          })
        }}
      >
        <PencilLine />
      </Button>
      <PostEditor open={open} setOpen={setOpen} />
    </>
  )
}

function SearchButton() {
  const { push } = useSecondaryPage()

  return (
    <Button variant="ghost" size="titlebar-icon" onClick={() => push(toSearch())}>
      <Search />
    </Button>
  )
}
