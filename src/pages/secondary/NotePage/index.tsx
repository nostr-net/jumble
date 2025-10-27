import { useSecondaryPage } from '@/PageManager'
import { ExtendedKind } from '@/constants'
import ContentPreview from '@/components/ContentPreview'
import Note from '@/components/Note'
import NoteInteractions from '@/components/NoteInteractions'
import NoteStats from '@/components/NoteStats'
import UserAvatar from '@/components/UserAvatar'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchEvent } from '@/hooks'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { getParentBech32Id, getParentETag, getRootBech32Id } from '@/lib/event'
import { toNote, toNoteList } from '@/lib/link'
import { tagNameEquals } from '@/lib/tag'
import { cn } from '@/lib/utils'
import { Ellipsis } from 'lucide-react'
import { Event } from 'nostr-tools'
import { forwardRef, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import NotFound from './NotFound'

const NotePage = forwardRef(({ id, index, hideTitlebar = false }: { id?: string; index?: number; hideTitlebar?: boolean }, ref) => {
  const { t } = useTranslation()
  const { event, isFetching } = useFetchEvent(id)
  const [externalEvent, setExternalEvent] = useState<Event | undefined>(undefined)
  const finalEvent = event || externalEvent
  
  const parentEventId = useMemo(() => getParentBech32Id(finalEvent), [finalEvent])
  const rootEventId = useMemo(() => getRootBech32Id(finalEvent), [finalEvent])
  const rootITag = useMemo(
    () => (finalEvent?.kind === ExtendedKind.COMMENT ? finalEvent.tags.find(tagNameEquals('I')) : undefined),
    [finalEvent]
  )
  const { isFetching: isFetchingRootEvent, event: rootEvent } = useFetchEvent(rootEventId)
  const { isFetching: isFetchingParentEvent, event: parentEvent } = useFetchEvent(parentEventId)

  if (!event && isFetching) {
    return (
      <SecondaryPageLayout ref={ref} index={index} title={hideTitlebar ? undefined : t('Note')}>
        <div className="px-4 pt-3">
          <div className="flex items-center space-x-2">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className={`flex-1 w-0`}>
              <div className="py-1">
                <Skeleton className="h-4 w-16" />
              </div>
              <div className="py-0.5">
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
          <div className="pt-2">
            <div className="my-1">
              <Skeleton className="w-full h-4 my-1 mt-2" />
            </div>
            <div className="my-1">
              <Skeleton className="w-2/3 h-4 my-1" />
            </div>
          </div>
        </div>
      </SecondaryPageLayout>
    )
  }
  if (!finalEvent) {
    return (
      <SecondaryPageLayout ref={ref} index={index} title={hideTitlebar ? undefined : t('Note')} displayScrollToTopButton>
        <NotFound bech32Id={id} onEventFound={setExternalEvent} />
      </SecondaryPageLayout>
    )
  }

  const getNoteTypeTitle = (kind: number): string => {
    switch (kind) {
      case 1: // kinds.ShortTextNote
        return 'Note: Text Post'
      case 30023: // kinds.LongFormArticle
        return 'Note: Longform Article'
      case 20: // ExtendedKind.PICTURE
        return 'Note: Picture'
      case 21: // ExtendedKind.VIDEO
        return 'Note: Video'
      case 22: // ExtendedKind.SHORT_VIDEO
        return 'Note: Short Video'
      case 11: // ExtendedKind.DISCUSSION
        return 'Note: Discussion Thread'
      case 9802: // kinds.Highlights
        return 'Note: Highlight'
      case 1068: // ExtendedKind.POLL
        return 'Note: Poll'
      case 31987: // ExtendedKind.RELAY_REVIEW
        return 'Note: Relay Review'
      case 9735: // ExtendedKind.ZAP_RECEIPT
        return 'Note: Zap Receipt'
      case 6: // kinds.Repost
        return 'Note: Repost'
      case 7: // kinds.Reaction
        return 'Note: Reaction'
      case 1111: // ExtendedKind.COMMENT
        return 'Note: Comment'
      case 1222: // ExtendedKind.VOICE
        return 'Note: Voice Post'
      case 1244: // ExtendedKind.VOICE_COMMENT
        return 'Note: Voice Comment'
      default:
        return 'Note'
    }
  }

  return (
    <SecondaryPageLayout ref={ref} index={index} title={hideTitlebar ? undefined : getNoteTypeTitle(finalEvent.kind)} displayScrollToTopButton>
      <div className="px-4 pt-3">
        {rootITag && <ExternalRoot value={rootITag[1]} />}
        {rootEventId && rootEventId !== parentEventId && (
          <ParentNote
            key={`root-note-${finalEvent.id}`}
            isFetching={isFetchingRootEvent}
            event={rootEvent}
            eventBech32Id={rootEventId}
            isConsecutive={isConsecutive(rootEvent, parentEvent)}
          />
        )}
        {parentEventId && (
          <ParentNote
            key={`parent-note-${finalEvent.id}`}
            isFetching={isFetchingParentEvent}
            event={parentEvent}
            eventBech32Id={parentEventId}
          />
        )}
        <Note
          key={`note-${finalEvent.id}`}
          event={finalEvent}
          className="select-text"
          hideParentNotePreview
          originalNoteId={id}
          showFull
        />
        <NoteStats className="mt-3" event={finalEvent} fetchIfNotExisting displayTopZapsAndLikes />
      </div>
      <Separator className="mt-4" />
      <div className="px-4 pb-4">
        <NoteInteractions key={`note-interactions-${finalEvent.id}`} pageIndex={index} event={finalEvent} />
      </div>
    </SecondaryPageLayout>
  )
})
NotePage.displayName = 'NotePage'
export default NotePage

function ExternalRoot({ value }: { value: string }) {
  const { push } = useSecondaryPage()

  return (
    <div>
      <Card
        className="flex space-x-1 px-1.5 py-1 items-center clickable text-sm text-muted-foreground hover:text-foreground"
        onClick={() => push(toNoteList({ externalContentId: value }))}
      >
        <div className="truncate">{value}</div>
      </Card>
      <div className="ml-5 w-px h-2 bg-border" />
    </div>
  )
}

function ParentNote({
  event,
  eventBech32Id,
  isFetching,
  isConsecutive = true
}: {
  event?: Event
  eventBech32Id: string
  isFetching: boolean
  isConsecutive?: boolean
}) {
  const { push } = useSecondaryPage()

  if (isFetching) {
    return (
      <div>
        <div className="flex space-x-1 px-[0.4375rem] py-1 items-center rounded-full border clickable text-sm text-muted-foreground">
          <Skeleton className="shrink w-4 h-4 rounded-full" />
          <div className="py-1 flex-1">
            <Skeleton className="h-3" />
          </div>
        </div>
        <div className="ml-5 w-px h-3 bg-border" />
      </div>
    )
  }

  return (
    <div>
      <div
        className={cn(
          'flex space-x-1 px-[0.4375rem] py-1 items-center rounded-full border clickable text-sm text-muted-foreground',
          event && 'hover:text-foreground'
        )}
        onClick={() => {
          push(toNote(event ?? eventBech32Id))
        }}
      >
        {event && <UserAvatar userId={event.pubkey} size="tiny" className="shrink-0" />}
        <ContentPreview className="truncate" event={event} />
      </div>
      {isConsecutive ? (
        <div className="ml-5 w-px h-3 bg-border" />
      ) : (
        <Ellipsis className="ml-3.5 text-muted-foreground/60 size-3" />
      )}
    </div>
  )
}

function isConsecutive(rootEvent?: Event, parentEvent?: Event) {
  const eTag = getParentETag(parentEvent)
  if (!eTag) return false

  return rootEvent?.id === eTag[1]
}
