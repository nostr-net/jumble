import { useSecondaryPage, useSmartHashtagNavigation } from '@/PageManager'
import ImageWithLightbox from '@/components/ImageWithLightbox'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Event, kinds } from 'nostr-tools'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useEventFieldParser } from '@/hooks/useContentParser'
import HighlightSourcePreview from '../../UniversalContent/HighlightSourcePreview'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ExtendedKind } from '@/constants'
import { createPortal } from 'react-dom'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { TImetaInfo } from '@/types'
import { useMediaExtraction } from '@/hooks'

export default function AsciidocArticle({
  event,
  className,
  hideImagesAndInfo = false
}: {
  event: Event
  className?: string
  hideImagesAndInfo?: boolean
}) {
  const { push } = useSecondaryPage()
  const { navigateToHashtag } = useSmartHashtagNavigation()
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

  // Process nostr addresses and other interactive elements after HTML is rendered
  useEffect(() => {
    if (!contentRef.current || !parsedContent) return

    const processInteractiveElements = () => {
      // Process embedded note containers
      const embeddedNotes = contentRef.current?.querySelectorAll('[data-embedded-note]')
      embeddedNotes?.forEach((container) => {
        const bech32Id = container.getAttribute('data-embedded-note')
        if (bech32Id) {
          // Replace with actual EmbeddedNote component
          const embeddedNoteElement = document.createElement('div')
          embeddedNoteElement.innerHTML = `<div data-embedded-note="${bech32Id}">Loading embedded event...</div>`
          container.parentNode?.replaceChild(embeddedNoteElement.firstChild!, container)
        }
      })

      // Process user handles
      const userHandles = contentRef.current?.querySelectorAll('[data-pubkey]')
      userHandles?.forEach((handle) => {
        const pubkey = handle.getAttribute('data-pubkey')
        if (pubkey) {
          // Replace with actual Username component
          const usernameElement = document.createElement('span')
          usernameElement.innerHTML = `<span class="user-handle" data-pubkey="${pubkey}">@${handle.textContent}</span>`
          handle.parentNode?.replaceChild(usernameElement.firstChild!, handle)
        }
      })

      // Process hashtag links in content
      const hashtagLinks = contentRef.current?.querySelectorAll('a.hashtag-link, a[href^="/notes?t="], a[href^="notes?t="]')
      hashtagLinks?.forEach((link) => {
        const href = link.getAttribute('href')
        if (href && (href.startsWith('/notes?t=') || href.startsWith('notes?t='))) {
          // Normalize href to include leading slash if missing
          const normalizedHref = href.startsWith('/') ? href : `/${href}`
          // Remove existing click handlers to avoid duplicates
          const newLink = link.cloneNode(true) as HTMLElement
          link.parentNode?.replaceChild(newLink, link)
          
          newLink.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            navigateToHashtag(normalizedHref)
          })
        }
      })

      // Process wikilinks
      const wikilinks = contentRef.current?.querySelectorAll('.wikilink')
      wikilinks?.forEach((wikilink) => {
        const dTag = wikilink.getAttribute('data-dtag')
        const displayText = wikilink.getAttribute('data-display')
        if (dTag && displayText) {
          // Add click handler for wikilinks
          wikilink.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            const mouseEvent = e as MouseEvent
            // Create dropdown menu similar to the original implementation
            const existingDropdown = document.querySelector('.wikilink-dropdown')
            if (existingDropdown) {
              existingDropdown.remove()
            }

            const dropdown = document.createElement('div')
            dropdown.className = 'wikilink-dropdown fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50 p-2'
            dropdown.style.left = `${mouseEvent.pageX}px`
            dropdown.style.top = `${mouseEvent.pageY + 10}px`

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
          })
        }
      })
    }

    // Process elements after a short delay to ensure content is rendered
    const timeoutId = setTimeout(processInteractiveElements, 100)
    
    return () => clearTimeout(timeoutId)
  }, [parsedContent?.html])

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

  // Extract images from content using the unified media extraction service
  // This includes images from tags, content, and parsed HTML
  const extractedMedia = useMediaExtraction(event, event.content)
  
  // Extract images from parsed HTML (after AsciiDoc processing) for carousel
  // This ensures we get images that were rendered in the HTML output
  const imagesInContent = useMemo<TImetaInfo[]>(() => {
    if (!parsedContent?.html || !event) return []
    
    const images: TImetaInfo[] = []
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
    const seenUrls = new Set<string>()
    
    // Create a map of extracted media by URL for metadata lookup
    const mediaMap = new Map<string, TImetaInfo>()
    extractedMedia.all.forEach((media) => {
      if (media.m?.startsWith('image/')) {
        mediaMap.set(media.url, media)
      }
    })
    
    let match
    while ((match = imgRegex.exec(parsedContent.html)) !== null) {
      const url = match[1]
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        // Use metadata from extracted media if available, otherwise create basic entry
        const mediaInfo = mediaMap.get(url) || { url, pubkey: event.pubkey }
        images.push(mediaInfo)
      }
    }
    
    return images
  }, [parsedContent?.html, event, extractedMedia])

  // Handle image clicks to open carousel
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  
  useEffect(() => {
    if (!contentRef.current || imagesInContent.length === 0) return

    const handleImageClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'IMG' && target.hasAttribute('data-asciidoc-image')) {
        event.preventDefault()
        event.stopPropagation()
        
        const imageIndex = target.getAttribute('data-image-index')
        if (imageIndex !== null) {
          setLightboxIndex(parseInt(imageIndex, 10))
        }
      }
    }

    const contentElement = contentRef.current
    contentElement.addEventListener('click', handleImageClick)
    
    return () => {
      contentElement.removeEventListener('click', handleImageClick)
    }
  }, [imagesInContent.length])

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
    <article className={`prose prose-zinc max-w-none dark:prose-invert break-words leading-relaxed ${parsedContent?.cssClasses || ''} ${className || ''}`}>
      {/* Article metadata - hide when used as nested content */}
      {!hideImagesAndInfo && (
        <header className="mb-8">
          <h1 className="break-words text-4xl font-bold mb-6 leading-tight">{metadata.title}</h1>
          {metadata.summary && (
            <blockquote className="border-l-4 border-primary pl-6 italic text-muted-foreground mb-8 text-lg leading-relaxed">
              <p className="break-words">{metadata.summary}</p>
            </blockquote>
          )}
          {metadata.image && (
            <div className="mb-8">
              <ImageWithLightbox
                image={{ url: metadata.image, pubkey: event.pubkey }}
                className="w-full max-w-[400px] h-auto object-contain rounded-lg shadow-lg mx-auto"
              />
            </div>
          )}
        </header>
      )}

      {/* Show title inline when used as nested content */}
      {hideImagesAndInfo && metadata.title && (
        <h2 className="text-2xl font-bold mb-4 leading-tight break-words">{metadata.title}</h2>
      )}

      {/* Render AsciiDoc content (everything is now processed as AsciiDoc) */}
      <div 
        ref={contentRef} 
        className={`prose prose-zinc max-w-none dark:prose-invert break-words leading-relaxed text-base ${isArticleType ? "asciidoc-content" : "simple-content"}`}
        style={{
          // Override any problematic AsciiDoc styles
          '--tw-prose-body': 'inherit',
          '--tw-prose-headings': 'inherit',
          '--tw-prose-lead': 'inherit',
          '--tw-prose-links': 'inherit',
          '--tw-prose-bold': 'inherit',
          '--tw-prose-counters': 'inherit',
          '--tw-prose-bullets': 'inherit',
          '--tw-prose-hr': 'inherit',
          '--tw-prose-quotes': 'inherit',
          '--tw-prose-quote-borders': 'inherit',
          '--tw-prose-captions': 'inherit',
          '--tw-prose-code': 'inherit',
          '--tw-prose-pre-code': 'inherit',
          '--tw-prose-pre-bg': 'inherit',
          '--tw-prose-th-borders': 'inherit',
          '--tw-prose-td-borders': 'inherit'
        } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: parsedContent?.html || '' }} 
      />

      {/* Image carousel lightbox */}
      {imagesInContent.length > 0 && lightboxIndex >= 0 && createPortal(
        <div onClick={(e) => e.stopPropagation()}>
          <Lightbox
            index={lightboxIndex}
            slides={imagesInContent.map(({ url }) => ({ 
              src: url, 
              alt: url 
            }))}
            plugins={[Zoom]}
            open={lightboxIndex >= 0}
            close={() => setLightboxIndex(-1)}
            controller={{
              closeOnBackdropClick: true,
              closeOnPullUp: true,
              closeOnPullDown: true
            }}
            styles={{
              toolbar: { paddingTop: '2.25rem' }
            }}
            carousel={{
              finite: false
            }}
          />
        </div>,
        document.body
      )}

      {/* Collapsible Article Info - only for article-type events */}
      {!hideImagesAndInfo && isArticleType && (parsedContent?.highlightSources?.length > 0 || parsedContent?.hashtags?.length > 0) && (
        <Collapsible open={isInfoOpen} onOpenChange={setIsInfoOpen} className="mt-4">
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span>Article Info</span>
              {isInfoOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 mt-2">

            {/* Highlight sources */}
            {parsedContent?.highlightSources?.length > 0 && (
              <div className="p-4 bg-muted rounded-lg">
                <h4 className="text-sm font-semibold mb-3">Highlight sources:</h4>
                <div className="space-y-3">
                  {parsedContent?.highlightSources?.map((source, index) => (
                    <HighlightSourcePreview
                      key={index}
                      source={source}
                      className="w-full"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Hashtags - only show t-tags that don't appear as #hashtag in content */}
            {(() => {
              // Get content hashtags from parsedContent (hashtags extracted from content as #hashtag)
              // Normalize to lowercase for comparison
              const contentHashtags = new Set((parsedContent?.hashtags || []).map(t => t.toLowerCase()))
              // Filter metadata.tags (t-tags from event) to exclude those already in content
              const tagsToShow = (metadata.tags || []).filter(tag => !contentHashtags.has(tag.toLowerCase()))
              return tagsToShow.length > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="text-sm font-semibold mb-3">Tags:</h4>
                  <div className="flex gap-2 flex-wrap">
                    {tagsToShow.map((tag) => (
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
              )
            })()}
          </CollapsibleContent>
        </Collapsible>
      )}
    </article>
  )
}