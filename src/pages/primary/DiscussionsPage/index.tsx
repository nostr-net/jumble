import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { DEFAULT_FAVORITE_RELAYS, FAST_READ_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import { forwardRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { MessageSquarePlus, Book, BookOpen, Hash, Search, X } from 'lucide-react'
import ThreadCard from '@/pages/primary/DiscussionsPage/ThreadCard'
import TopicFilter from '@/pages/primary/DiscussionsPage/TopicFilter'
import ThreadSort, { SortOption } from '@/pages/primary/DiscussionsPage/ThreadSort'
import CreateThreadDialog, { DISCUSSION_TOPICS } from '@/pages/primary/DiscussionsPage/CreateThreadDialog'
import ViewToggle from '@/pages/primary/DiscussionsPage/ViewToggle'
import SubtopicFilter from '@/pages/primary/DiscussionsPage/SubtopicFilter'
import TopicSubscribeButton from '@/components/TopicSubscribeButton'
import { NostrEvent } from 'nostr-tools'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { useSecondaryPage } from '@/PageManager'
import { toNote } from '@/lib/link'
import { kinds } from 'nostr-tools'
import { 
  analyzeThreadTopics, 
  getCategorizedTopic, 
  getDynamicSubtopics
} from '@/lib/discussion-topics'

// Simple event map type
type EventMapEntry = {
  event: NostrEvent
  relaySources: string[]
  tTags: string[]
  hashtags: string[]
  allTopics: string[]
  categorizedTopic: string
}

const DiscussionsPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { relaySets } = useFavoriteRelays()
  const { pubkey } = useNostr()
  const { push } = useSecondaryPage()
  
  // State management
  const [selectedTopic, setSelectedTopic] = useState('all')
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null)
  const [selectedRelay, setSelectedRelay] = useState<string | null>(null)
  const [selectedSort, setSelectedSort] = useState<SortOption>('newest')
  const [eventMap, setEventMap] = useState<Map<string, EventMapEntry>>(new Map())
  const [filteredEvents, setFilteredEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped')
  const [groupedEvents, setGroupedEvents] = useState<Record<string, NostrEvent[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  
  // Topic analysis for dynamic subtopics
  const [topicAnalysis, setTopicAnalysis] = useState<ReturnType<typeof analyzeThreadTopics>>(new Map())
  const [availableSubtopics, setAvailableSubtopics] = useState<string[]>([])

  // State for all available relays
  const [allRelays, setAllRelays] = useState<string[]>([])

  // Get all available relays (always use all relays for building the map)
  useEffect(() => {
    const updateRelays = async () => {
      let userWriteRelays: string[] = []
      let storedRelaySetRelays: string[] = []
      
      if (pubkey) {
        try {
          // Get user's write relays
          const relayList = await client.fetchRelayList(pubkey)
          userWriteRelays = relayList?.write || []
          
          // Get relays from stored relay sets
          const storedRelaySets = storage.getRelaySets()
          storedRelaySetRelays = storedRelaySets.flatMap(set => set.relayUrls)
        } catch (error) {
          console.warn('Failed to fetch user relay list:', error)
        }
      }
      
      // Normalize and deduplicate all relays
      const relays = Array.from(new Set([
        ...DEFAULT_FAVORITE_RELAYS.map(url => normalizeUrl(url) || url), 
        ...userWriteRelays.map(url => normalizeUrl(url) || url), 
        ...storedRelaySetRelays.map(url => normalizeUrl(url) || url), 
        ...FAST_READ_RELAY_URLS.map(url => normalizeUrl(url) || url)
      ]))
      
      setAllRelays(relays)
    }
    
    updateRelays()
  }, [pubkey])

  // Available topic IDs for matching
  const availableTopicIds = useMemo(() => 
    DISCUSSION_TOPICS.map(topic => topic.id),
    []
  )

  // Fetch all kind 11 events from all relays
  const fetchAllEvents = useCallback(async () => {
    setLoading(true)
    try {
      // Fetch recent kind 11 events (last 30 days)
      const thirtyDaysAgo = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000)
      
      const events = await client.fetchEvents(allRelays, [
        {
          kinds: [11], // Thread events
          since: thirtyDaysAgo,
          limit: 100
        }
      ])
      
      // Create a map of events with their relay sources
      const newEventMap = new Map<string, { event: NostrEvent, relaySources: string[] }>()
      
      events.forEach(event => {
        const eventHints = client.getEventHints(event.id)
        const relaySources = eventHints.length > 0 ? eventHints : ['unknown']
        
        if (newEventMap.has(event.id)) {
          // Event already exists, add relay sources
          const existing = newEventMap.get(event.id)!
          existing.relaySources = [...new Set([...existing.relaySources, ...relaySources])]
        } else {
          // New event
          newEventMap.set(event.id, { event, relaySources })
        }
      })
      
      // Get all event IDs to check for deletions
      const eventIds = Array.from(newEventMap.keys())
      
      // Fetch deletion events for these specific event IDs
      let deletedEventIds = new Set<string>()
      if (eventIds.length > 0) {
        try {
          const deletionEvents = await client.fetchEvents(allRelays, [
            {
              kinds: [kinds.EventDeletion],
              '#e': eventIds,
              since: thirtyDaysAgo,
              limit: 1000
            }
          ])
          
          // Extract deleted event IDs
          deletionEvents.forEach(deletionEvent => {
            const deletedEventTags = deletionEvent.tags.filter(tag => tag[0] === 'e' && tag[1])
            deletedEventTags.forEach(tag => {
              if (tag[1] && eventIds.includes(tag[1])) {
                deletedEventIds.add(tag[1])
              }
            })
          })
        } catch (error) {
          console.warn('Failed to fetch deletion events:', error)
        }
      }
      
      // Build the final event map with topic information
      const finalEventMap = new Map<string, EventMapEntry>()
      
      newEventMap.forEach(({ event, relaySources }, eventId) => {
        // Skip deleted events
        if (deletedEventIds.has(eventId)) {
          return
        }
        
        // Extract topics
        const tTags = event.tags.filter(tag => tag[0] === 't' && tag[1]).map(tag => tag[1])
        const hashtags = (event.content.match(/#\w+/g) || []).map(tag => tag.slice(1))
        const allTopics = [...new Set([...tTags, ...hashtags])]
        const categorizedTopic = getCategorizedTopic(event, availableTopicIds)
        
        finalEventMap.set(eventId, {
          event,
          relaySources,
          tTags,
          hashtags,
          allTopics,
          categorizedTopic
        })
      })
      
      setEventMap(finalEventMap)
    } catch (error) {
      console.error('Error fetching events:', error)
      setEventMap(new Map())
    } finally {
      setLoading(false)
    }
  }, [allRelays, availableTopicIds])

  // Fetch events on component mount and periodically
  useEffect(() => {
    if (allRelays.length > 0) {
      fetchAllEvents()
      
      // Refetch every 5 minutes
      const interval = setInterval(fetchAllEvents, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [fetchAllEvents])

  // Filter events based on selected relay
  const getFilteredEvents = useCallback(() => {
    const events = Array.from(eventMap.values())
    
    // Filter by selected relay if specified
    let filtered = events
    if (selectedRelay) {
      // Check if it's a relay set
      const relaySet = relaySets.find(set => set.id === selectedRelay)
      if (relaySet) {
        filtered = events.filter(entry => 
          entry.relaySources.some(source => relaySet.relayUrls.includes(source))
        )
      } else {
        // It's an individual relay
        filtered = events.filter(entry => 
          entry.relaySources.includes(selectedRelay)
        )
      }
    }
    
    return filtered.map(entry => entry.event)
  }, [eventMap, selectedRelay, relaySets])

  // Filter threads by topic and search
  const filterAndSortEvents = useCallback(() => {
    const events = getFilteredEvents()
    
    // Filter by topic
    let filtered = events
    if (selectedTopic !== 'all') {
      filtered = events.filter(event => {
        const entry = eventMap.get(event.id)
        if (!entry) return false
        
        if (entry.categorizedTopic !== selectedTopic) return false
        
        if (selectedSubtopic) {
          return entry.allTopics.includes(selectedSubtopic)
        }
        
        return true
      })
    }
    
    // Apply search filter
    if (searchQuery.trim()) {
      const lowerQuery = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(event => {
        // Search in title
        const titleTag = event.tags.find(tag => tag[0] === 'title')
        if (titleTag && titleTag[1]?.toLowerCase().includes(lowerQuery)) {
          return true
        }
        
        // Search in content
        if (event.content.toLowerCase().includes(lowerQuery)) {
          return true
        }
        
        // Search in topics
        const entry = eventMap.get(event.id)
        if (entry) {
          return entry.allTopics.some(topic => 
            topic.toLowerCase().includes(lowerQuery)
          )
        }
        
        return false
      })
    }
    
    // Sort events
    const sorted = [...filtered].sort((a, b) => {
      switch (selectedSort) {
        case 'newest':
          return b.created_at - a.created_at
        case 'oldest':
          return a.created_at - b.created_at
        default:
          return b.created_at - a.created_at
      }
    })
    
    setFilteredEvents(sorted)
    
    // Handle grouped view
    if (viewMode === 'grouped' && selectedTopic === 'all') {
      const grouped = sorted.reduce((groups, event) => {
        const entry = eventMap.get(event.id)
        if (!entry) return groups
        
        const topic = entry.categorizedTopic || 'general'
        if (!groups[topic]) {
          groups[topic] = []
        }
        groups[topic].push(event)
        return groups
      }, {} as Record<string, NostrEvent[]>)
      
      // Sort groups by newest event
      const sortedGrouped = Object.fromEntries(
        Object.entries(grouped)
          .sort(([, eventsA], [, eventsB]) => {
            const newestA = eventsA[0]?.created_at || 0
            const newestB = eventsB[0]?.created_at || 0
            return newestB - newestA
          })
      )
      
      setGroupedEvents(sortedGrouped)
    } else {
      setGroupedEvents({})
    }
  }, [getFilteredEvents, selectedTopic, selectedSubtopic, selectedSort, searchQuery, viewMode, eventMap])

  // Update filtered events when dependencies change
  useEffect(() => {
    filterAndSortEvents()
  }, [filterAndSortEvents])

  // Analyze topics whenever event map changes
  useEffect(() => {
    const events = Array.from(eventMap.values()).map(entry => entry.event)
    if (events.length > 0) {
      const analysis = analyzeThreadTopics(events, availableTopicIds)
      setTopicAnalysis(analysis)
    } else {
      setTopicAnalysis(new Map())
    }
  }, [eventMap, availableTopicIds])

  // Update available subtopics when topic analysis or selected topic changes
  useEffect(() => {
    if (selectedTopic && selectedTopic !== 'all') {
      const subtopics = getDynamicSubtopics(topicAnalysis.get(selectedTopic), 3)
      
      // Special case: Always include 'readings' as a subtopic for 'literature'
      if (selectedTopic === 'literature' && !subtopics.includes('readings')) {
        subtopics.unshift('readings')
      }
      
      setAvailableSubtopics(subtopics)
    } else {
      setAvailableSubtopics([])
    }
  }, [topicAnalysis, selectedTopic])

  const handleCreateThread = () => {
    setShowCreateThread(true)
  }

  const handleThreadCreated = () => {
    setShowCreateThread(false)
    // Refetch events to include the new thread
    fetchAllEvents()
  }

  return (
    <PrimaryPageLayout
      ref={ref}
      pageName="discussions"
      titlebar={
        <div className="flex gap-1 items-center h-full justify-between">
          <div className="flex gap-1 items-center">
            <TopicFilter
              topics={DISCUSSION_TOPICS}
              selectedTopic={selectedTopic}
              onTopicChange={(topic) => {
                setSelectedTopic(topic)
                setSelectedSubtopic(null)
              }}
              threads={viewMode === 'grouped' && selectedTopic === 'all' ? filteredEvents : filteredEvents}
              replies={[]}
            />
            {(allRelays.length > 1 || relaySets.length > 0) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-10 text-sm">
                    {selectedRelay ? (
                      relaySets.find(set => set.id === selectedRelay)?.name || 
                      selectedRelay.replace('wss://', '').replace('ws://', '')
                    ) : (
                      'All Relays'
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setSelectedRelay(null)}>
                    All Relays
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {relaySets.map(relaySet => (
                    <DropdownMenuItem 
                      key={relaySet.id} 
                      onClick={() => setSelectedRelay(relaySet.id)}
                    >
                      {relaySet.name}
                    </DropdownMenuItem>
                  ))}
                  {allRelays.map(relay => (
                    <DropdownMenuItem 
                      key={relay} 
                      onClick={() => setSelectedRelay(relay)}
                    >
                      {relay.replace('wss://', '').replace('ws://', '')}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex gap-1 items-center">
            <Button
              variant="ghost"
              size="titlebar-icon"
              onClick={handleCreateThread}
              title={t('Create new thread')}
            >
              <MessageSquarePlus />
            </Button>
          </div>
        </div>
      }
      displayScrollToTopButton
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">
              {t('Discussions')} - {selectedTopic === 'all' ? t('All Topics') : DISCUSSION_TOPICS.find(t => t.id === selectedTopic)?.label}
            </h1>
            {selectedTopic !== 'all' && selectedTopic !== 'general' && (
              <TopicSubscribeButton topic={selectedTopic} size="sm" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedTopic === 'all' && (
              <ViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            )}
            <ThreadSort 
              selectedSort={selectedSort}
              onSortChange={setSelectedSort}
            />
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Search by title, content, or topics...')}
                className="w-full pl-10 pr-10 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  title={t('Clear search')}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Subtopic filter */}
        {selectedTopic !== 'all' && availableSubtopics.length > 0 && (
          <SubtopicFilter
            subtopics={availableSubtopics}
            selectedSubtopic={selectedSubtopic}
            onSubtopicChange={setSelectedSubtopic}
          />
        )}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">{t('Loading threads...')}</div>
          </div>
        ) : selectedTopic !== 'all' && availableSubtopics.length > 0 && !selectedSubtopic ? (
          <div className="space-y-6">
            {/* General section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b">
                <BookOpen className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{t('General')}</h2>
                <span className="text-sm text-muted-foreground">
                  ({filteredEvents.filter(event => {
                    const entry = eventMap.get(event.id)
                    if (!entry) return false
                    return !availableSubtopics.some(subtopic => entry.allTopics.includes(subtopic))
                  }).length} {filteredEvents.filter(event => {
                    const entry = eventMap.get(event.id)
                    if (!entry) return false
                    return !availableSubtopics.some(subtopic => entry.allTopics.includes(subtopic))
                  }).length === 1 ? t('thread') : t('threads')})
                </span>
              </div>
              <div className="space-y-3">
                {filteredEvents.filter(event => {
                  const entry = eventMap.get(event.id)
                  if (!entry) return false
                  return !availableSubtopics.some(subtopic => entry.allTopics.includes(subtopic))
                }).map(event => (
                  <ThreadCard
                    key={event.id}
                    thread={event}
                    subtopics={availableSubtopics}
                    onThreadClick={() => {
                      push(toNote(event))
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Dynamic subtopics sections */}
            {availableSubtopics.map(subtopic => {
              const subtopicEvents = filteredEvents.filter(event => {
                const entry = eventMap.get(event.id)
                if (!entry) return false
                return entry.allTopics.includes(subtopic)
              })
              
              if (subtopicEvents.length === 0) return null
              
              const isReadingsSubtopic = subtopic === 'readings' && selectedTopic === 'literature'
              
              return (
                <div key={subtopic} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    {isReadingsSubtopic ? (
                      <Book className="w-5 h-5 text-primary" />
                    ) : (
                      <Hash className="w-5 h-5 text-primary" />
                    )}
                    <h2 className="text-lg font-semibold">
                      {subtopic.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </h2>
                    <span className="text-sm text-muted-foreground">
                      ({subtopicEvents.length} {subtopicEvents.length === 1 ? t('thread') : t('threads')})
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {subtopicEvents.map(event => (
                      <ThreadCard
                        key={event.id}
                        thread={event}
                        subtopics={availableSubtopics}
                        onThreadClick={() => {
                          push(toNote(event))
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (viewMode === 'grouped' && selectedTopic === 'all' ? 
          Object.keys(groupedEvents).length === 0 : 
          filteredEvents.length === 0) ? (
          <Card>
            <CardContent className="p-8 text-center">
              <MessageSquarePlus className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">{t('No threads yet')}</h3>
              <p className="text-muted-foreground mb-4">
                {selectedTopic === 'all' 
                  ? t('No discussion threads found. Try refreshing or check your relay connection.')
                  : t('Be the first to start a discussion in this topic!')
                }
              </p>
              <div className="flex gap-2 justify-center">
                <Button onClick={handleCreateThread}>
                  <MessageSquarePlus className="w-4 h-4 mr-2" />
                  {t('Create Thread')}
                </Button>
                <Button variant="outline" onClick={fetchAllEvents}>
                  {t('Refresh')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === 'grouped' && selectedTopic === 'all' ? (
          <div className="space-y-6">
            {Object.entries(groupedEvents).map(([topicId, topicEvents]) => {
              const topicInfo = DISCUSSION_TOPICS.find(t => t.id === topicId)
              if (!topicInfo || topicEvents.length === 0) return null
              
              return (
                <div key={topicId} className="space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <topicInfo.icon className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold">{topicInfo.label}</h2>
                    <span className="text-sm text-muted-foreground">
                      ({topicEvents.length} {topicEvents.length === 1 ? t('thread') : t('threads')})
                    </span>
                  </div>
                  <div className="space-y-3">
                    {topicEvents.map(event => {
                      const entry = eventMap.get(event.id)
                      const threadSubtopics = entry?.categorizedTopic === 'literature' 
                        ? ['readings']
                        : getDynamicSubtopics(topicAnalysis.get(entry?.categorizedTopic || 'general'), 3)
                      
                      return (
                        <ThreadCard
                          key={event.id}
                          thread={event}
                          subtopics={threadSubtopics}
                          onThreadClick={() => {
                            push(toNote(event))
                          }}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvents.map(event => {
              const entry = eventMap.get(event.id)
              const threadSubtopics = entry?.categorizedTopic === 'literature' 
                ? ['readings']
                : getDynamicSubtopics(topicAnalysis.get(entry?.categorizedTopic || 'general'), 3)
              
              return (
                <ThreadCard
                  key={event.id}
                  thread={event}
                  subtopics={threadSubtopics}
                  onThreadClick={() => {
                    push(toNote(event))
                  }}
                />
              )
            })}
          </div>
        )}
      </div>

      {showCreateThread && (
        <CreateThreadDialog
          topic={selectedTopic}
          availableRelays={allRelays}
          relaySets={relaySets}
          selectedRelay={selectedRelay}
          onClose={() => setShowCreateThread(false)}
          onThreadCreated={handleThreadCreated}
        />
      )}
    </PrimaryPageLayout>
  )
})

DiscussionsPage.displayName = 'DiscussionsPage'
export default DiscussionsPage
