import SearchBar, { TSearchBarRef } from '@/components/SearchBar'
import SearchResult from '@/components/SearchResult'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { toSearch } from '@/lib/link'
import { useSecondaryPage } from '@/PageManager'
import { TSearchParams } from '@/types'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'

const SearchPage = forwardRef(({ index, hideTitlebar = false }: { index?: number; hideTitlebar?: boolean }, ref) => {
  const { push } = useSecondaryPage()
  const [input, setInput] = useState('')
  const searchBarRef = useRef<TSearchBarRef>(null)
  const searchParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const type = params.get('t')
    if (
      type !== 'profile' &&
      type !== 'profiles' &&
      type !== 'notes' &&
      type !== 'hashtag' &&
      type !== 'relay'
    ) {
      return null
    }
    const search = params.get('q')
    if (!search) {
      return null
    }
    const input = params.get('i') ?? ''
    setInput(input || search)
    return { type, search, input } as TSearchParams
  }, [])

  useEffect(() => {
    if (!window.location.search) {
      searchBarRef.current?.focus()
    }
  }, [])

  const onSearch = (params: TSearchParams | null) => {
    if (params) {
      push(toSearch(params))
    }
  }

  return (
    <SecondaryPageLayout
      ref={ref}
      index={index}
      title={hideTitlebar ? undefined : "Search"}
      hideBackButton={hideTitlebar}
      displayScrollToTopButton
    >
      <div className="px-4 pt-4">
        <div className="text-2xl font-bold mb-4">Search Nostr</div>
        <SearchBar ref={searchBarRef} input={input} setInput={setInput} onSearch={onSearch} />
        <div className="h-4"></div>
        <div className="text-xl font-semibold mb-4">Trending Notes</div>
        <SearchResult searchParams={searchParams} />
      </div>
    </SecondaryPageLayout>
  )
})
SearchPage.displayName = 'SearchPage'
export default SearchPage
