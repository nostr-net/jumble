import { Skeleton } from '@/components/ui/skeleton'
import { useFetchEvent } from '@/hooks'
import { cn } from '@/lib/utils'
import client from '@/services/client.service'
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Event } from 'nostr-tools'
import ClientSelect from '../ClientSelect'
import MainNoteCard from '../NoteCard/MainNoteCard'

export function EmbeddedNote({ noteId, className }: { noteId: string; className?: string }) {
  const { event, isFetching } = useFetchEvent(noteId)
  const [retryEvent, setRetryEvent] = useState<Event | undefined>(undefined)
  const [isRetrying, setIsRetrying] = useState(false)

  // If the first fetch fails, try a force retry with the four-tier system
  useEffect(() => {
    if (!isFetching && !event && !isRetrying) {
      setIsRetrying(true)
      client.fetchEventForceRetry(noteId)
        .then((retryResult) => {
          if (retryResult) {
            setRetryEvent(retryResult)
          }
        })
        .catch((error) => {
          console.warn('Force retry failed for event:', noteId, error)
        })
        .finally(() => {
          setIsRetrying(false)
        })
    }
  }, [isFetching, event, noteId, isRetrying])

  const finalEvent = event || retryEvent
  const finalIsFetching = isFetching || isRetrying

  if (finalIsFetching) {
    return <EmbeddedNoteSkeleton className={className} />
  }

  if (!finalEvent) {
    return <EmbeddedNoteNotFound className={className} noteId={noteId} />
  }

  return (
    <MainNoteCard
      className={cn('w-full', className)}
      event={finalEvent}
      embedded
      originalNoteId={noteId}
    />
  )
}

function EmbeddedNoteSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('text-left p-2 sm:p-3 border rounded-lg', className)}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center space-x-2">
        <Skeleton className="w-9 h-9 rounded-full" />
        <div>
          <Skeleton className="h-3 w-16 my-1" />
          <Skeleton className="h-3 w-16 my-1" />
        </div>
      </div>
      <Skeleton className="w-full h-4 my-1 mt-2" />
      <Skeleton className="w-2/3 h-4 my-1" />
    </div>
  )
}

function EmbeddedNoteNotFound({ noteId, className }: { noteId: string; className?: string }) {
  const { t } = useTranslation()

  return (
    <div className={cn('text-left p-2 sm:p-3 border rounded-lg', className)}>
      <div className="flex flex-col items-center text-muted-foreground font-medium gap-2">
        <div>{t('Sorry! The note cannot be found 😔')}</div>
        <ClientSelect className="w-full mt-2" originalNoteId={noteId} />
      </div>
    </div>
  )
}
