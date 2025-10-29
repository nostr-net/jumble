import { ExtendedKind } from '@/constants'
import { Event } from 'nostr-tools'
import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import AsciidocArticle from '../AsciidocArticle/AsciidocArticle'
import { generateBech32IdFromATag } from '@/lib/tag'
import client from '@/services/client.service'
import logger from '@/lib/logger'
import { Button } from '@/components/ui/button'
import { MoreVertical } from 'lucide-react'
import indexedDb from '@/services/indexed-db.service'

interface PublicationReference {
  coordinate: string
  event?: Event
  kind: number
  pubkey: string
  identifier: string
  relay?: string
  eventId?: string
}

interface ToCItem {
  title: string
  coordinate: string
  event?: Event
  kind: number
  children?: ToCItem[]
}

interface PublicationMetadata {
  title?: string
  summary?: string
  image?: string
  author?: string
  version?: string
  type?: string
  tags: string[]
}

export default function PublicationIndex({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  // Parse publication metadata from event tags
  const metadata = useMemo<PublicationMetadata>(() => {
    const meta: PublicationMetadata = { tags: [] }
    
    for (const [tagName, tagValue] of event.tags) {
      if (tagName === 'title') {
        meta.title = tagValue
      } else if (tagName === 'summary') {
        meta.summary = tagValue
      } else if (tagName === 'image') {
        meta.image = tagValue
      } else if (tagName === 'author') {
        meta.author = tagValue
      } else if (tagName === 'version') {
        meta.version = tagValue
      } else if (tagName === 'type') {
        meta.type = tagValue
      } else if (tagName === 't' && tagValue) {
        meta.tags.push(tagValue.toLowerCase())
      }
    }
    
    // Fallback title from d-tag if no title
    if (!meta.title) {
      meta.title = event.tags.find(tag => tag[0] === 'd')?.[1]
    }
    
    return meta
  }, [event])
  const [references, setReferences] = useState<PublicationReference[]>([])
  const [visitedIndices, setVisitedIndices] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(true)

  // Build table of contents from references
  const tableOfContents = useMemo<ToCItem[]>(() => {
    const toc: ToCItem[] = []
    
    for (const ref of references) {
      if (!ref.event) continue
      
      // Extract title from the event
      const title = ref.event.tags.find(tag => tag[0] === 'title')?.[1] || 
                    ref.event.tags.find(tag => tag[0] === 'd')?.[1] || 
                    'Untitled'
      
      const tocItem: ToCItem = {
        title,
        coordinate: ref.coordinate,
        event: ref.event,
        kind: ref.kind
      }
      
      // For nested 30040 publications, recursively get their ToC
      if (ref.kind === ExtendedKind.PUBLICATION && ref.event) {
        const nestedRefs: ToCItem[] = []
        
        // Parse nested references from this publication
        for (const tag of ref.event.tags) {
          if (tag[0] === 'a' && tag[1]) {
            const [kindStr, , identifier] = tag[1].split(':')
            const kind = parseInt(kindStr)
            
            if (!isNaN(kind) && kind === ExtendedKind.PUBLICATION_CONTENT || 
                kind === ExtendedKind.WIKI_ARTICLE || 
                kind === ExtendedKind.PUBLICATION) {
              // For this simplified version, we'll just extract the title from the coordinate
              const nestedTitle = identifier || 'Untitled'
              
              nestedRefs.push({
                title: nestedTitle,
                coordinate: tag[1],
                kind
              })
            }
          }
        }
        
        if (nestedRefs.length > 0) {
          tocItem.children = nestedRefs
        }
      }
      
      toc.push(tocItem)
    }
    
    return toc
  }, [references])

  // Scroll to section
  const scrollToSection = (coordinate: string) => {
    const element = document.getElementById(`section-${coordinate.replace(/:/g, '-')}`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Export publication as AsciiDoc
  const exportPublication = async () => {
    try {
      // Collect all content from references
      const contentParts: string[] = []
      
      for (const ref of references) {
        if (!ref.event) continue
        
        // Extract title
        const title = ref.event.tags.find(tag => tag[0] === 'title')?.[1] || 'Untitled'
        
        // For AsciiDoc, output the raw content with title
        contentParts.push(`= ${title}\n\n${ref.event.content}\n\n`)
      }
      
      const fullContent = contentParts.join('\n')
      const filename = `${metadata.title || 'publication'}.adoc`
      
      // Export as AsciiDoc
      const blob = new Blob([fullContent], { type: 'text/plain' })
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      logger.info('[PublicationIndex] Exported publication as .adoc')
    } catch (error) {
      logger.error('[PublicationIndex] Error exporting publication:', error)
      alert('Failed to export publication. Please try again.')
    }
  }

  // Extract references from 'a' tags
  const referencesData = useMemo(() => {
    const refs: PublicationReference[] = []
    for (const tag of event.tags) {
      if (tag[0] === 'a' && tag[1]) {
        const [kindStr, pubkey, identifier] = tag[1].split(':')
        const kind = parseInt(kindStr)
        if (!isNaN(kind)) {
          refs.push({
            coordinate: tag[1],
            kind,
            pubkey,
            identifier: identifier || '',
            relay: tag[2],
            eventId: tag[3] // Optional event ID for version tracking
          })
        }
      }
    }
    return refs
  }, [event])

  // Add current event to visited set
  const currentCoordinate = useMemo(() => {
    const dTag = event.tags.find(tag => tag[0] === 'd')?.[1] || ''
    return `${event.kind}:${event.pubkey}:${dTag}`
  }, [event])

  useEffect(() => {
    setVisitedIndices(prev => new Set([...prev, currentCoordinate]))
    
    // Cache the current publication index event using its actual event ID
    indexedDb.putPublicationEvent(event).catch(err => {
      logger.error('[PublicationIndex] Error caching publication event:', err)
    })
  }, [currentCoordinate, event])

  // Fetch referenced events
  useEffect(() => {
    let isMounted = true
    
    const fetchReferences = async () => {
      setIsLoading(true)
      const fetchedRefs: PublicationReference[] = []
      
      // Capture current visitedIndices at the start of the fetch
      const currentVisited = visitedIndices
      
      // Add a timeout to prevent infinite loading on mobile
      const timeout = setTimeout(() => {
        if (isMounted) {
          logger.warn('[PublicationIndex] Fetch timeout reached, setting loaded state')
          setIsLoading(false)
        }
      }, 30000) // 30 second timeout
      
      try {
        for (const ref of referencesData) {
          if (!isMounted) break
          
          // Skip if this is a 30040 event we've already visited (prevent circular references)
          if (ref.kind === ExtendedKind.PUBLICATION) {
            if (currentVisited.has(ref.coordinate)) {
              logger.debug('[PublicationIndex] Skipping visited 30040 index:', ref.coordinate)
              fetchedRefs.push({ ...ref, event: undefined })
              continue
            }
          }

          try {
            // Generate bech32 ID from the 'a' tag
            const aTag = ['a', ref.coordinate, ref.relay || '', ref.eventId || '']
            const bech32Id = generateBech32IdFromATag(aTag)
            
            if (bech32Id) {
              // First, check if we have this event by its eventId in the ref
              let fetchedEvent: Event | undefined = undefined
              
              if (ref.eventId) {
                // Try to get by event ID first
                fetchedEvent = await indexedDb.getPublicationEvent(ref.eventId)
              }
              
              // If not found by event ID, try to fetch from relay
              if (!fetchedEvent) {
                fetchedEvent = await client.fetchEvent(bech32Id)
                // Save to cache using the fetched event's ID as the key
                if (fetchedEvent) {
                  await indexedDb.putPublicationEvent(fetchedEvent)
                  logger.debug('[PublicationIndex] Cached event with ID:', fetchedEvent.id)
                }
              } else {
                logger.debug('[PublicationIndex] Loaded from cache by event ID:', ref.eventId)
              }
              
              if (fetchedEvent && isMounted) {
                fetchedRefs.push({ ...ref, event: fetchedEvent })
              } else if (isMounted) {
                logger.warn('[PublicationIndex] Could not fetch event for:', ref.coordinate)
                fetchedRefs.push({ ...ref, event: undefined })
              }
            } else if (isMounted) {
              logger.warn('[PublicationIndex] Could not generate bech32 ID for:', ref.coordinate)
              fetchedRefs.push({ ...ref, event: undefined })
            }
          } catch (error) {
            logger.error('[PublicationIndex] Error fetching reference:', error)
            if (isMounted) {
              fetchedRefs.push({ ...ref, event: undefined })
            }
          }
        }
        
        if (isMounted) {
          setReferences(fetchedRefs)
          setIsLoading(false)
        }
      } finally {
        clearTimeout(timeout)
      }
    }

    if (referencesData.length > 0) {
      fetchReferences()
    } else {
      setIsLoading(false)
    }
    
    return () => {
      isMounted = false
    }
  }, [referencesData, visitedIndices]) // Now include visitedIndices but capture it inside

  return (
    <div className={cn('space-y-6', className)}>
      {/* Publication Metadata */}
      <div className="prose prose-zinc max-w-none dark:prose-invert">
        <header className="mb-8 border-b pb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <h1 className="text-4xl font-bold leading-tight break-words flex-1">{metadata.title}</h1>
            <Button 
              variant="ghost" 
              size="icon" 
              className="shrink-0"
              onClick={exportPublication}
              title="Export as AsciiDoc"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
          {metadata.summary && (
            <blockquote className="border-l-4 border-primary pl-6 italic text-muted-foreground mb-4 text-lg leading-relaxed">
              <p className="break-words">{metadata.summary}</p>
            </blockquote>
          )}
          <div className="text-sm text-muted-foreground space-y-1">
            {metadata.author && (
              <div>
                <span className="font-semibold">Author:</span> {metadata.author}
              </div>
            )}
            {metadata.version && (
              <div>
                <span className="font-semibold">Version:</span> {metadata.version}
              </div>
            )}
            {metadata.type && (
              <div>
                <span className="font-semibold">Type:</span> {metadata.type}
              </div>
            )}
          </div>
        </header>
      </div>

      {/* Table of Contents */}
      {!isLoading && tableOfContents.length > 0 && (
        <div className="border rounded-lg p-6 bg-muted/30">
          <h2 className="text-xl font-semibold mb-4">Table of Contents</h2>
          <nav>
            <ul className="space-y-2">
              {tableOfContents.map((item, index) => (
                <ToCItemComponent 
                  key={index} 
                  item={item} 
                  onItemClick={scrollToSection}
                  level={0}
                />
              ))}
            </ul>
          </nav>
        </div>
      )}

      {/* Content - render referenced events */}
      {isLoading ? (
        <div className="text-muted-foreground">
          <div>Loading publication content...</div>
          <div className="text-xs mt-2">If this takes too long, the content may not be available.</div>
        </div>
      ) : references.length === 0 ? (
        <div className="p-6 border rounded-lg bg-muted/30 text-center">
          <div className="text-lg font-semibold mb-2">No content loaded</div>
          <div className="text-sm text-muted-foreground">
            Unable to load publication content. The referenced events may not be available on the current relays.
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {references.map((ref, index) => {
            if (!ref.event) {
              return (
                <div key={index} className="p-4 border rounded-lg bg-muted/50">
                  <div className="text-sm text-muted-foreground">
                    Reference {index + 1}: Unable to load event from coordinate {ref.coordinate}
                  </div>
                </div>
              )
            }

            // Render based on event kind
            const sectionId = `section-${ref.coordinate.replace(/:/g, '-')}`
            
            if (ref.kind === ExtendedKind.PUBLICATION) {
              // Recursively render nested 30040 publication index
              return (
                <div key={index} id={sectionId} className="border-l-4 border-primary pl-6 scroll-mt-4">
                  <PublicationIndex event={ref.event} />
                </div>
              )
            } else if (ref.kind === ExtendedKind.PUBLICATION_CONTENT || ref.kind === ExtendedKind.WIKI_ARTICLE) {
              // Render 30041 or 30818 content as AsciidocArticle
              return (
                <div key={index} id={sectionId} className="scroll-mt-4">
                  <AsciidocArticle event={ref.event} hideImagesAndInfo={true} />
                </div>
              )
            } else {
              // Fallback for other kinds - just show a placeholder
              return (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    Reference {index + 1}: Unsupported kind {ref.kind}
                  </div>
                </div>
              )
            }
          })}
        </div>
      )}
    </div>
  )
}

// ToC Item Component - renders nested table of contents items
function ToCItemComponent({
  item,
  onItemClick,
  level
}: {
  item: ToCItem
  onItemClick: (coordinate: string) => void
  level: number
}) {
  const indentClass = level > 0 ? `ml-${level * 4}` : ''
  
  return (
    <li className={cn('list-none', indentClass)}>
      <button
        onClick={() => onItemClick(item.coordinate)}
        className="text-left text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer"
      >
        {item.title}
      </button>
      {item.children && item.children.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.children.map((child, childIndex) => (
            <ToCItemComponent
              key={childIndex}
              item={child}
              onItemClick={onItemClick}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

