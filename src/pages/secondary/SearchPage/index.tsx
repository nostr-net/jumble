import SearchBar, { TSearchBarRef } from '@/components/SearchBar'
import SearchResult from '@/components/SearchResult'
import SecondaryPageLayout from '@/layouts/SecondaryPageLayout'
import { toSearch } from '@/lib/link'
import { parseAdvancedSearch } from '@/lib/search-parser'
import { useSecondaryPage } from '@/PageManager'
import { TSearchParams } from '@/types'
import SearchInfo from '@/components/SearchInfo'
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
      // Check if this is a 'notes' search that contains advanced search parameters
      if (params.type === 'notes' && params.search) {
        const searchParams = parseAdvancedSearch(params.search)
        
        // Check if we have advanced search parameters (not just plain text)
        const hasAdvancedParams = Object.keys(searchParams).some(key => 
          key !== 'dtag' && searchParams[key as keyof typeof searchParams]
        )
        
        if (hasAdvancedParams || searchParams.dtag) {
          // Route to NoteListPage with advanced search
          const urlParams = new URLSearchParams()
          if (searchParams.dtag) {
            urlParams.set('d', searchParams.dtag)
          }
          if (searchParams.title) {
            if (Array.isArray(searchParams.title)) {
              searchParams.title.forEach(t => urlParams.append('title', t))
            } else {
              urlParams.set('title', searchParams.title)
            }
          }
          if (searchParams.subject) {
            if (Array.isArray(searchParams.subject)) {
              searchParams.subject.forEach(s => urlParams.append('subject', s))
            } else {
              urlParams.set('subject', searchParams.subject)
            }
          }
          if (searchParams.description) {
            if (Array.isArray(searchParams.description)) {
              searchParams.description.forEach(d => urlParams.append('description', d))
            } else {
              urlParams.set('description', searchParams.description)
            }
          }
          if (searchParams.author) {
            if (Array.isArray(searchParams.author)) {
              searchParams.author.forEach(a => urlParams.append('author', a))
            } else {
              urlParams.set('author', searchParams.author)
            }
          }
          if (searchParams.pubkey) {
            if (Array.isArray(searchParams.pubkey)) {
              searchParams.pubkey.forEach(p => urlParams.append('pubkey', p))
            } else {
              urlParams.set('pubkey', searchParams.pubkey)
            }
          }
          if (searchParams.events) {
            if (Array.isArray(searchParams.events)) {
              searchParams.events.forEach(e => urlParams.append('events', e))
            } else {
              urlParams.set('events', searchParams.events)
            }
          }
          if (searchParams.type) {
            if (Array.isArray(searchParams.type)) {
              searchParams.type.forEach(t => urlParams.append('type', t))
            } else {
              urlParams.set('type', searchParams.type)
            }
          }
          if (searchParams.from) urlParams.set('from', searchParams.from)
          if (searchParams.to) urlParams.set('to', searchParams.to)
          if (searchParams.before) urlParams.set('before', searchParams.before)
          if (searchParams.after) urlParams.set('after', searchParams.after)
          if (searchParams.kinds) {
            searchParams.kinds.forEach(k => urlParams.append('k', k.toString()))
          }
          
          push(`/notes?${urlParams.toString()}`)
          return
        }
      }
      
      // Default behavior - route to SearchPage
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
        <div className="flex items-center gap-2 mb-4 relative z-40">
          <div className="flex-1 relative">
            <SearchBar ref={searchBarRef} input={input} setInput={setInput} onSearch={onSearch} />
          </div>
          <div className="flex-shrink-0 relative z-50">
            <SearchInfo />
          </div>
        </div>
        <div className="h-4"></div>
        <div className="text-xl font-semibold mb-4">Trending Notes</div>
        <SearchResult searchParams={searchParams} />
      </div>
    </SecondaryPageLayout>
  )
})
SearchPage.displayName = 'SearchPage'
export default SearchPage
