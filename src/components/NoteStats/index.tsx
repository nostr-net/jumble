import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useFeed } from '@/providers/FeedProvider'
import noteStatsService from '@/services/note-stats.service'
import { ExtendedKind } from '@/constants'
import { getRootEventHexId } from '@/lib/event'
import client from '@/services/client.service'
import { Event } from 'nostr-tools'
import { useEffect, useState, useMemo } from 'react'
import BookmarkButton from '../BookmarkButton'
import LikeButton from './LikeButton'
import Likes from './Likes'
import ReplyButton from './ReplyButton'
import RepostButton from './RepostButton'
import SeenOnButton from './SeenOnButton'
import TopZaps from './TopZaps'
import ZapButton from './ZapButton'

export default function NoteStats({
  event,
  className,
  classNames,
  fetchIfNotExisting = false,
  displayTopZapsAndLikes = false
}: {
  event: Event
  className?: string
  classNames?: {
    buttonBar?: string
  }
  fetchIfNotExisting?: boolean
  displayTopZapsAndLikes?: boolean
}) {
  const { isSmallScreen } = useScreenSize()
  const { pubkey } = useNostr()
  const { favoriteRelays } = useFavoriteRelays()
  const [loading, setLoading] = useState(false)
  
  // Hide repost button for discussion events and replies to discussions
  const isDiscussion = event.kind === ExtendedKind.DISCUSSION
  const [isReplyToDiscussion, setIsReplyToDiscussion] = useState(false)
  
  useMemo(() => {
    if (isDiscussion) return // Already a discussion event
    
    const rootEventId = getRootEventHexId(event)
    if (rootEventId) {
      // Fetch the root event to check if it's a discussion
      client.fetchEvent(rootEventId).then(rootEvent => {
        if (rootEvent && rootEvent.kind === ExtendedKind.DISCUSSION) {
          setIsReplyToDiscussion(true)
        }
      }).catch(() => {
        // If we can't fetch the root event, assume it's not a discussion reply
        setIsReplyToDiscussion(false)
      })
    }
  }, [event.id, isDiscussion])

  useEffect(() => {
    if (!fetchIfNotExisting) return
    setLoading(true)
    noteStatsService.fetchNoteStats(event, pubkey, favoriteRelays).finally(() => setLoading(false))
  }, [event, fetchIfNotExisting])

  if (isSmallScreen) {
    return (
      <div className={cn('select-none', className)}>
        {displayTopZapsAndLikes && (
          <>
            <TopZaps event={event} />
            <Likes event={event} />
          </>
        )}
        <div
          className={cn(
            'flex justify-between items-center h-5 [&_svg]:size-5',
            loading ? 'animate-pulse' : '',
            classNames?.buttonBar
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ReplyButton event={event} />
          {!isDiscussion && !isReplyToDiscussion && <RepostButton event={event} />}
          <LikeButton event={event} />
          <ZapButton event={event} />
          <BookmarkButton event={event} />
          <SeenOnButton event={event} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('select-none', className)}>
      {displayTopZapsAndLikes && (
        <>
          <TopZaps event={event} />
          <Likes event={event} />
        </>
      )}
      <div className="flex justify-between h-5 [&_svg]:size-4">
        <div
          className={cn('flex items-center', loading ? 'animate-pulse' : '')}
          onClick={(e) => e.stopPropagation()}
        >
          <ReplyButton event={event} />
          {!isDiscussion && !isReplyToDiscussion && <RepostButton event={event} />}
          <LikeButton event={event} />
          <ZapButton event={event} />
        </div>
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <BookmarkButton event={event} />
          <SeenOnButton event={event} />
        </div>
      </div>
    </div>
  )
}
