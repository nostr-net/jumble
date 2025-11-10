import NoteCard from '@/components/NoteCard'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileTimeline } from '@/hooks/useProfileTimeline'
import { Event } from 'nostr-tools'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { ExtendedKind } from '@/constants'

interface ProfileMediaProps {
  pubkey: string
  topSpace?: number
  searchQuery?: string
  kindFilter?: string
  onEventsChange?: (events: Event[]) => void
}

const MEDIA_KIND_LIST = [
  ExtendedKind.PICTURE,
  ExtendedKind.VIDEO,
  ExtendedKind.SHORT_VIDEO,
  ExtendedKind.VOICE,
  ExtendedKind.VOICE_COMMENT
]

const ProfileMedia = forwardRef<{ refresh: () => void; getEvents: () => Event[] }, ProfileMediaProps>(
  ({ pubkey, topSpace, searchQuery = '', kindFilter = 'all', onEventsChange }, ref) => {
    const [isRefreshing, setIsRefreshing] = useState(false)

    const cacheKey = useMemo(() => `${pubkey}-media`, [pubkey])

    const { events: timelineEvents, isLoading, refresh } = useProfileTimeline({
      pubkey,
      cacheKey,
      kinds: MEDIA_KIND_LIST,
      limit: 200
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
        },
        getEvents: () => timelineEvents
      }),
      [refresh, timelineEvents]
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

    const getKindLabel = (kindValue: string) => {
      if (!kindValue || kindValue === 'all') return 'media items'
      const kindNum = parseInt(kindValue, 10)
      if (kindNum === ExtendedKind.PICTURE) return 'photos'
      if (kindNum === ExtendedKind.VIDEO) return 'videos'
      if (kindNum === ExtendedKind.SHORT_VIDEO) return 'short videos'
      if (kindNum === ExtendedKind.VOICE) return 'voice posts'
      if (kindNum === ExtendedKind.VOICE_COMMENT) return 'voice comments'
      return 'media'
    }

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
            {searchQuery.trim()
              ? `No ${getKindLabel(kindFilter)} match your search`
              : `No ${getKindLabel(kindFilter)} found`}
          </div>
        </div>
      )
    }

    return (
      <div style={{ marginTop: topSpace || 0 }}>
        {isRefreshing && (
          <div className="px-4 py-2 text-sm text-green-500 text-center">🔄 Refreshing media...</div>
        )}
        {(searchQuery.trim() || (kindFilter && kindFilter !== 'all')) && (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            {filteredEvents.length} of {eventsFilteredByKind.length} {getKindLabel(kindFilter)}
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

ProfileMedia.displayName = 'ProfileMedia'

export default ProfileMedia

