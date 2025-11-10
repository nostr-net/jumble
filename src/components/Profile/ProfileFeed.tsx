import { ExtendedKind } from '@/constants'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import NoteCard from '@/components/NoteCard'
import { Skeleton } from '@/components/ui/skeleton'
import { kinds, Event } from 'nostr-tools'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { useProfileTimeline } from '@/hooks/useProfileTimeline'
import { useZap } from '@/providers/ZapProvider'

interface ProfileFeedProps {
  pubkey: string
  topSpace?: number
  searchQuery?: string
  kindFilter?: string
  onEventsChange?: (events: Event[]) => void
}

const POST_KIND_LIST = [
  kinds.ShortTextNote,
  kinds.Repost,
  ExtendedKind.COMMENT,
  ExtendedKind.DISCUSSION,
  ExtendedKind.POLL,
  ExtendedKind.ZAP_RECEIPT
]

const ProfileFeed = forwardRef<{ refresh: () => void }, ProfileFeedProps>(
  ({ pubkey, topSpace, searchQuery = '', kindFilter = 'all', onEventsChange }, ref) => {
    const { zapReplyThreshold } = useZap()
    const [isRefreshing, setIsRefreshing] = useState(false)

    const filterPredicate = useMemo(
      () => (event: Event) => {
        if (event.kind === ExtendedKind.ZAP_RECEIPT) {
          const zapInfo = getZapInfoFromEvent(event)
          if (!zapInfo?.amount || zapInfo.amount < zapReplyThreshold) {
            return false
          }
        }
        return true
      },
      [zapReplyThreshold]
    )

    const cacheKey = useMemo(() => `${pubkey}-posts-${zapReplyThreshold}`, [pubkey, zapReplyThreshold])

    const { events: timelineEvents, isLoading, refresh } = useProfileTimeline({
      pubkey,
      cacheKey,
      kinds: POST_KIND_LIST,
      limit: 200,
      filterPredicate
    })

    useEffect(() => {
      onEventsChange?.(timelineEvents)
    }, [timelineEvents, onEventsChange])

    useEffect(() => {
      if (!isLoading) {
        setIsRefreshing(false)
      }
    }, [isLoading])

    useImperativeHandle(
      ref,
      () => ({
        refresh: () => {
          setIsRefreshing(true)
          refresh()
        }
      }),
      [refresh]
    )

    const eventsFilteredByKind = useMemo(() => {
      if (kindFilter === 'all') {
        return timelineEvents
      }
      const kindNumber = parseInt(kindFilter, 10)
      if (Number.isNaN(kindNumber)) {
        return timelineEvents
      }
      return timelineEvents.filter((event) => event.kind === kindNumber)
    }, [timelineEvents, kindFilter])

    const filteredEvents = useMemo(() => {
      if (!searchQuery.trim()) {
        return eventsFilteredByKind
      }
      const query = searchQuery.toLowerCase()
      return eventsFilteredByKind.filter(
        (event) =>
          event.content.toLowerCase().includes(query) ||
          event.tags.some((tag) => tag.length > 1 && tag[1]?.toLowerCase().includes(query))
      )
    }, [eventsFilteredByKind, searchQuery])

    if (!pubkey) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-sm text-muted-foreground">No profile selected</div>
        </div>
      )
    }

    if (isLoading && timelineEvents.length === 0) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )
    }

    if (!filteredEvents.length && !isLoading) {
      return (
        <div className="flex justify-center items-center py-8">
          <div className="text-sm text-muted-foreground">
            {searchQuery.trim() ? 'No posts match your search' : 'No posts found'}
          </div>
        </div>
      )
    }

    return (
      <div style={{ marginTop: topSpace || 0 }}>
        {isRefreshing && (
          <div className="px-4 py-2 text-sm text-green-500 text-center">🔄 Refreshing posts...</div>
        )}
        {searchQuery.trim() && (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            {filteredEvents.length} of {eventsFilteredByKind.length} posts
          </div>
        )}
        <div className="space-y-2">
          {filteredEvents.map((event) => (
            <NoteCard key={event.id} className="w-full" event={event} filterMutedNotes={false} />
          ))}
        </div>
      </div>
    )
  }
)

ProfileFeed.displayName = 'ProfileFeed'

export default ProfileFeed
