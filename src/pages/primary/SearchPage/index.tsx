import SearchBar, { TSearchBarRef } from '@/components/SearchBar'
import SearchResult from '@/components/SearchResult'
import PrimaryPageLayout, { TPrimaryPageLayoutRef } from '@/layouts/PrimaryPageLayout'
import { usePrimaryPage } from '@/PageManager'
import { TSearchParams } from '@/types'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'

const SearchPage = forwardRef((_, ref) => {
  const { current, display } = usePrimaryPage()
  const [input, setInput] = useState('')
  const [searchParams, setSearchParams] = useState<TSearchParams | null>(null)
  const isActive = useMemo(() => current === 'search' && display, [current, display])
  const searchBarRef = useRef<TSearchBarRef>(null)
  const layoutRef = useRef<TPrimaryPageLayoutRef>(null)

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: (behavior: ScrollBehavior = 'smooth') => layoutRef.current?.scrollToTop(behavior)
    }),
    []
  )

  useEffect(() => {
    if (isActive && !searchParams) {
      searchBarRef.current?.focus()
    }
  }, [isActive, searchParams])

  const onSearch = (params: TSearchParams | null) => {
    setSearchParams(params)
    if (params?.input) {
      setInput(params.input)
    }
    layoutRef.current?.scrollToTop('instant')
  }

  return (
    <PrimaryPageLayout
      ref={layoutRef}
      pageName="search"
      displayScrollToTopButton
    >
      <div className="px-4 pt-4">
        <div className="text-2xl font-bold mb-4">Search Nostr</div>
        <SearchBar ref={searchBarRef} onSearch={onSearch} input={input} setInput={setInput} />
        <div className="h-4"></div>
        <SearchResult searchParams={searchParams} />
      </div>
    </PrimaryPageLayout>
  )
})
SearchPage.displayName = 'SearchPage'
export default SearchPage
