import { useSecondaryPage } from '@/PageManager'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useEventFieldParser } from '@/hooks/useContentParser'
import WebPreview from '../../WebPreview'
import HighlightSourcePreview from '../../UniversalContent/HighlightSourcePreview'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ExtendedKind } from '@/constants'

export default function Article({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const { push } = useSecondaryPage()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  
  // Determine if this is an article-type event that should show ToC and Article Info
  const isArticleType = useMemo(() => {
    return event.kind === kinds.LongFormArticle || 
           event.kind === ExtendedKind.WIKI_ARTICLE || 
           event.kind === ExtendedKind.PUBLICATION ||
           event.kind === ExtendedKind.PUBLICATION_CONTENT
  }, [event.kind])
  
  // Use the comprehensive content parser
  const { parsedContent, isLoading, error } = useEventFieldParser(event, 'content', {
    enableMath: true,
    enableSyntaxHighlighting: true
  })

  const contentRef = useRef<HTMLDivElement>(null)

  // Handle wikilink clicks
  useEffect(() => {
    if (!contentRef.current) return

    const handleWikilinkClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.classList.contains('wikilink')) {
        event.preventDefault()
        const dTag = target.getAttribute('data-dtag')
        const displayText = target.getAttribute('data-display')
        
        if (dTag && displayText) {
          // Create a simple dropdown menu
          const existingDropdown = document.querySelector('.wikilink-dropdown')
          if (existingDropdown) {
            existingDropdown.remove()
          }

          const dropdown = document.createElement('div')
          dropdown.className = 'wikilink-dropdown fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 p-2'
          dropdown.style.left = `${event.pageX}px`
          dropdown.style.top = `${event.pageY + 10}px`

          const wikistrButton = document.createElement('button')
          wikistrButton.className = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2'
          wikistrButton.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>View on Wikistr'
          wikistrButton.onclick = () => {
            window.open(`https://wikistr.imwald.eu/${dTag}`, '_blank', 'noopener,noreferrer')
            dropdown.remove()
          }

          const alexandriaButton = document.createElement('button')
          alexandriaButton.className = 'w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-2'
          alexandriaButton.innerHTML = '<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>View on Alexandria'
          alexandriaButton.onclick = () => {
            window.open(`https://next-alexandria.gitcitadel.eu/events?d=${dTag}`, '_blank', 'noopener,noreferrer')
            dropdown.remove()
          }

          dropdown.appendChild(wikistrButton)
          dropdown.appendChild(alexandriaButton)
          document.body.appendChild(dropdown)

          // Close dropdown when clicking outside
          const closeDropdown = (e: MouseEvent) => {
            if (!dropdown.contains(e.target as Node)) {
              dropdown.remove()
              document.removeEventListener('click', closeDropdown)
            }
          }
          setTimeout(() => document.addEventListener('click', closeDropdown), 0)
        }
      }
    }

    contentRef.current.addEventListener('click', handleWikilinkClick)
    
    return () => {
      contentRef.current?.removeEventListener('click', handleWikilinkClick)
    }
  }, [parsedContent])

  // Add ToC return buttons to section headers
  useEffect(() => {
    if (!contentRef.current || !isArticleType || !parsedContent) return

    const addTocReturnButtons = () => {
      const headers = contentRef.current?.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (!headers) return

      headers.forEach((header) => {
        // Skip if button already exists
        if (header.querySelector('.toc-return-btn')) return

        // Create the return button
        const returnBtn = document.createElement('span')
        returnBtn.className = 'toc-return-btn'
        returnBtn.innerHTML = '↑ ToC'
        returnBtn.title = 'Return to Table of Contents'
        
        // Add click handler
        returnBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          // Scroll to the ToC
          const tocElement = document.getElementById('toc')
          if (tocElement) {
            tocElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
        
        // Add the button to the header
        header.appendChild(returnBtn)
      })
    }

    // Add buttons after a short delay to ensure content is rendered
    const timeoutId = setTimeout(addTocReturnButtons, 100)
    
    return () => clearTimeout(timeoutId)
  }, [parsedContent?.html, isArticleType])


  if (isLoading) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div>Loading content...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div className="text-red-500">Error loading content: {error.message}</div>
      </div>
    )
  }

  if (!parsedContent) {
    return (
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words ${className || ''}`}>
        <div>No content available</div>
      </div>
    )
  }

  return (
    <div className={`${parsedContent.cssClasses} ${className || ''}`}>
      {/* Article metadata */}
      <h1 className="break-words">{metadata.title}</h1>
      {metadata.summary && (
        <blockquote>
          <p className="break-words">{metadata.summary}</p>
        </blockquote>
      )}
      {metadata.image && (
        <ImageWithLightbox
          image={{ url: metadata.image, pubkey: event.pubkey }}
          className="w-full max-w-[400px] h-auto object-contain my-0"
        />
      )}


      {/* Render AsciiDoc content (everything is now processed as AsciiDoc) */}
      <div ref={contentRef} className={isArticleType ? "asciidoc-content" : "simple-content"} dangerouslySetInnerHTML={{ __html: parsedContent.html }} />

      {/* Collapsible Article Info - only for article-type events */}
      {isArticleType && (parsedContent.media.length > 0 || parsedContent.links.length > 0 || parsedContent.nostrLinks.length > 0 || parsedContent.highlightSources.length > 0 || parsedContent.hashtags.length > 0) && (
        <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>Article Info</span>
              {isInfoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-2">
            {/* Media thumbnails */}
            {parsedContent.media.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-3">Images in this article:</h4>
                <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 gap-1">
                  {parsedContent.media.map((media, index) => (
                    <div key={index} className="aspect-square">
                      <ImageWithLightbox
                        image={media}
                        className="w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                        classNames={{
                          wrapper: 'w-full h-full'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links summary with OpenGraph previews */}
            {parsedContent.links.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-3">Links in this article:</h4>
                <div className="space-y-3">
                  {parsedContent.links.map((link, index) => (
                    <WebPreview
                      key={index}
                      url={link.url}
                      className="w-full"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Nostr links summary */}
            {parsedContent.nostrLinks.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-2">Nostr references:</h4>
                <div className="space-y-1">
                  {parsedContent.nostrLinks.map((link, index) => (
                    <div key={index} className="text-sm">
                      <span className="font-mono text-blue-600">{link.type}:</span>{' '}
                      <span className="font-mono">{link.id}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlight sources */}
            {parsedContent.highlightSources.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-3">Highlight sources:</h4>
                <div className="space-y-3">
                  {parsedContent.highlightSources.map((source, index) => (
                    <HighlightSourcePreview
                      key={index}
                      source={source}
                      className="w-full"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags */}
            {parsedContent.hashtags.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-3">Tags:</h4>
                <div className="flex gap-2 flex-wrap">
                  {parsedContent.hashtags.map((tag) => (
                    <div
                      key={tag}
                      title={tag}
                      className="flex items-center rounded-full px-3 py-1 bg-background text-muted-foreground max-w-44 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        push(toNoteList({ hashtag: tag, kinds: [kinds.LongFormArticle] }))
                      }}
                    >
                      #<span className="truncate">{tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}