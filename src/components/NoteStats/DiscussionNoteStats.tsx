import { cn } from '@/lib/utils'
import { useNostr } from '@/providers/NostrProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import noteStatsService from '@/services/note-stats.service'
import { Event } from 'nostr-tools'
import { useEffect, useState } from 'react'
import VoteButtons from './VoteButtons'
import ReplyButton from './ReplyButton'
import SeenOnButton from './SeenOnButton'

export default function DiscussionNoteStats({
  event,
  className,
  classNames,
  fetchIfNotExisting = false
}: {
  event: Event
  className?: string
  classNames?: {
    buttonBar?: string
  }
  fetchIfNotExisting?: boolean
}) {
  const { isSmallScreen } = useScreenSize()
  const { pubkey } = useNostr()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fetchIfNotExisting) return
    setLoading(true)
    noteStatsService.fetchNoteStats(event, pubkey).finally(() => setLoading(false))
  }, [event, fetchIfNotExisting])

  if (isSmallScreen) {
    return (
      <div className={cn('select-none', className)}>
        <div
          className={cn(
            'flex justify-between items-center h-5 [&_svg]:size-5',
            loading ? 'animate-pulse' : '',
            classNames?.buttonBar
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ReplyButton event={event} />
          <VoteButtons event={event} />
          <SeenOnButton event={event} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('select-none', className)}>
      <div className="flex justify-between h-5 [&_svg]:size-4">
        <div
          className={cn('flex items-center gap-2', loading ? 'animate-pulse' : '')}
          onClick={(e) => e.stopPropagation()}
        >
          <ReplyButton event={event} />
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <VoteButtons event={event} />
          <SeenOnButton event={event} />
        </div>
      </div>
    </div>
  )
}
