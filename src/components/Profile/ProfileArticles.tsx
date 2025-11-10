import { ExtendedKind } from '@/constants'
import { Event, kinds } from 'nostr-tools'
import { forwardRef, useMemo } from 'react'
import ProfileTimeline from './ProfileTimeline'

const ARTICLE_KINDS = [
  kinds.LongFormArticle,
  ExtendedKind.WIKI_ARTICLE_MARKDOWN,
  ExtendedKind.WIKI_ARTICLE,
  ExtendedKind.PUBLICATION,
  kinds.Highlights
]

interface ProfileArticlesProps {
  pubkey: string
  topSpace?: number
  searchQuery?: string
  kindFilter?: string
  onEventsChange?: (events: Event[]) => void
}

const ProfileArticles = forwardRef<{ refresh: () => void; getEvents: () => Event[] }, ProfileArticlesProps>(
  ({ pubkey, topSpace, searchQuery = '', kindFilter = 'all', onEventsChange }, ref) => {
    const cacheKey = useMemo(() => `${pubkey}-articles`, [pubkey])

    const getKindLabel = (kindValue: string) => {
      if (!kindValue || kindValue === 'all') return 'articles, publications, or highlights'
      const kindNum = parseInt(kindValue, 10)
      if (kindNum === kinds.LongFormArticle) return 'long form articles'
      if (kindNum === ExtendedKind.WIKI_ARTICLE_MARKDOWN) return 'wiki articles (markdown)'
      if (kindNum === ExtendedKind.WIKI_ARTICLE) return 'wiki articles (asciidoc)'
      if (kindNum === ExtendedKind.PUBLICATION) return 'publications'
      if (kindNum === kinds.Highlights) return 'highlights'
      return 'items'
    }

    return (
      <ProfileTimeline
        ref={ref}
        pubkey={pubkey}
        topSpace={topSpace}
        searchQuery={searchQuery}
        kindFilter={kindFilter}
        onEventsChange={onEventsChange}
        kinds={ARTICLE_KINDS}
        cacheKey={cacheKey}
        getKindLabel={getKindLabel}
        refreshLabel="Refreshing articles..."
        emptyLabel="No articles found"
        emptySearchLabel="No articles match your search"
      />
    )
  }
)

ProfileArticles.displayName = 'ProfileArticles'

export default ProfileArticles
