import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNote, toNoteList } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { Event, kinds } from 'nostr-tools'
import { nip19 } from 'nostr-tools'
import { useMemo } from 'react'
import { BookOpen, Globe } from 'lucide-react'
import Image from '../Image'

export default function WikiCard({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { isSmallScreen } = useScreenSize()
  const { push } = useSecondaryPage()
  const { autoLoadMedia } = useContentPolicy()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])

  // Extract d-tag for Wikistr URL
  const dTag = useMemo(() => {
    return event.tags.find(tag => tag[0] === 'd')?.[1] || ''
  }, [event])

  // Generate naddr for Alexandria URL
  const naddr = useMemo(() => {
    try {
      const relays = event.tags
        .filter(tag => tag[0] === 'relay')
        .map(tag => tag[1])
        .filter(Boolean)
      
      return nip19.naddrEncode({
        kind: event.kind,
        pubkey: event.pubkey,
        identifier: dTag,
        relays: relays.length > 0 ? relays : undefined
      })
    } catch (error) {
      console.error('Error generating naddr:', error)
      return ''
    }
  }, [event, dTag])

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    push(toNote(event.id))
  }

  const handleWikistrClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (dTag) {
      window.open(`https://wikistr.imwald.eu/${dTag}*${event.pubkey}`, '_blank', 'noopener,noreferrer')
    }
  }

  const handleAlexandriaClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (naddr) {
      window.open(`https://next-alexandria.gitcitadel.eu/publication/naddr/${naddr}`, '_blank', 'noopener,noreferrer')
    }
  }

  const titleComponent = <div className="text-xl font-semibold line-clamp-2">{metadata.title}</div>

  const tagsComponent = metadata.tags.length > 0 && (
    <div className="flex gap-1 flex-wrap">
      {metadata.tags.map((tag) => (
        <div
          key={tag}
          className="flex items-center rounded-full text-xs px-2.5 py-0.5 bg-muted text-muted-foreground max-w-32 cursor-pointer hover:bg-accent hover:text-accent-foreground"
          onClick={(e) => {
            e.stopPropagation()
            push(toNoteList({ hashtag: tag, kinds: [kinds.LongFormArticle] }))
          }}
        >
          #<span className="truncate">{tag}</span>
        </div>
      ))}
    </div>
  )

  const summaryComponent = metadata.summary && (
    <div className="text-sm text-muted-foreground line-clamp-4">{metadata.summary}</div>
  )

  const buttons = (
    <div className="flex gap-2 flex-wrap">
      {dTag && (
        <button
          onClick={handleWikistrClick}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-green-100 hover:bg-green-200 dark:bg-green-900 dark:hover:bg-green-800 text-green-800 dark:text-green-200 rounded-md transition-colors"
        >
          <Globe className="w-4 h-4" />
          View in Wikistr
        </button>
      )}
      {naddr && (
        <button
          onClick={handleAlexandriaClick}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 hover:bg-blue-200 dark:bg-blue-900 dark:hover:bg-blue-800 text-blue-800 dark:text-blue-200 rounded-md transition-colors"
        >
          <BookOpen className="w-4 h-4" />
          View in Alexandria
        </button>
      )}
    </div>
  )

  if (isSmallScreen) {
    return (
      <div className={className}>
        <div 
          className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50 transition-colors"
          onClick={handleCardClick}
        >
          {metadata.image && autoLoadMedia && (
            <Image
              image={{ url: metadata.image, pubkey: event.pubkey }}
              className="w-full max-w-[400px] aspect-video mb-3"
              hideIfError
            />
          )}
          <div className="space-y-2">
            {titleComponent}
            {summaryComponent}
            {tagsComponent}
            <div className="flex justify-end">
              {buttons}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={className}>
      <div 
        className="cursor-pointer rounded-lg border p-4 hover:bg-muted/50 transition-colors"
        onClick={handleCardClick}
      >
        <div className="flex gap-4">
          {metadata.image && autoLoadMedia && (
            <Image
              image={{ url: metadata.image, pubkey: event.pubkey }}
              className="rounded-lg aspect-[4/3] xl:aspect-video object-cover bg-foreground h-44 max-w-[400px]"
              hideIfError
            />
          )}
          <div className="flex-1 w-0 space-y-2">
            {titleComponent}
            {summaryComponent}
            {tagsComponent}
            <div className="flex justify-end">
              {buttons}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
