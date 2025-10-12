import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FAST_READ_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import { forwardRef, useEffect, useState, useCallback, useRef } from 'react'
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
import { useSecondaryPage } from '@/PageManager'
import { toNote } from '@/lib/link'
import { kinds } from 'nostr-tools'

// Normalize subtopic hashtags using linguistic rules to group similar variations
function normalizeSubtopic(tag: string): string {
  let normalized = tag.toLowerCase().trim()
  
  // Don't normalize very short words (2 chars or less)
  if (normalized.length <= 2) {
    return normalized
  }
  
  // Handle common suffixes to find root forms
  
  // Remove trailing 's' for plurals (but not if word ends in 'ss')
  if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
    // Special cases for words ending in 'ies' -> 'y' (e.g., stories -> story)
    if (normalized.endsWith('ies') && normalized.length > 4) {
      return normalized.slice(0, -3) + 'y'
    }
    // Special cases for words ending in 'es' (e.g., churches -> church, but not always)
    if (normalized.endsWith('ches') || normalized.endsWith('shes') || normalized.endsWith('xes') || 
        normalized.endsWith('zes') || normalized.endsWith('ses')) {
      return normalized.slice(0, -2)
    }
    // Regular plural: just remove 's'
    return normalized.slice(0, -1)
  }
  
  // Handle -ing forms (e.g., reading -> read, cooking -> cook)
  if (normalized.endsWith('ing') && normalized.length > 5) {
    const root = normalized.slice(0, -3)
    // Handle doubled consonants (e.g., running -> run, shopping -> shop)
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) {
      return root.slice(0, -1)
    }
    return root
  }
  
  // Handle -ed forms (e.g., deleted -> delete)
  if (normalized.endsWith('ed') && normalized.length > 4) {
    const root = normalized.slice(0, -2)
    // Handle doubled consonants
    if (root.length >= 2 && root[root.length - 1] === root[root.length - 2]) {
      return root.slice(0, -1)
    }
    return root
  }
  
  // Handle -er forms (e.g., developer -> develop, but not 'user' -> 'us')
  if (normalized.endsWith('er') && normalized.length > 4 && !normalized.endsWith('eer')) {
    return normalized.slice(0, -2)
  }
  
  // Handle -ly adverbs (e.g., quickly -> quick)
  if (normalized.endsWith('ly') && normalized.length > 4) {
    return normalized.slice(0, -2)
  }
  
  // Handle -y to -ies (e.g., philosophy/philosophical, economy/economics)
  // Already handled by the 'ies' -> 'y' rule above
  
  // Handle -ism, -ist, -ian variations (e.g., Buddhism/Buddhist, Christian/Christianity)
  if (normalized.endsWith('ism') && normalized.length > 5) {
    return normalized.slice(0, -3)
  }
  if (normalized.endsWith('ist') && normalized.length > 5) {
    return normalized.slice(0, -3)
  }
  if (normalized.endsWith('ity') && normalized.length > 5) {
    return normalized.slice(0, -3)
  }
  if (normalized.endsWith('ian') && normalized.length > 5) {
    return normalized.slice(0, -3)
  }
  if (normalized.endsWith('ians') && normalized.length > 6) {
    return normalized.slice(0, -4)
  }
  
  return normalized
}

// Function to determine topic based on actual t-tags and hashtags
function getTopicFromTags(allTopics: string[], availableTopicIds: string[]): string {
  // Normalize topics to lowercase for case-insensitive matching
  const normalizedTopics = allTopics.map(t => t.toLowerCase())
  const normalizedTopicIds = availableTopicIds.map(t => t.toLowerCase())
  
  // Check if any of the event's topics match the available topic IDs (case-insensitive)
  for (let i = 0; i < normalizedTopics.length; i++) {
    const index = normalizedTopicIds.indexOf(normalizedTopics[i])
    if (index !== -1) {
      return availableTopicIds[index] // Return the original case from availableTopicIds
    }
  }
  
  // If no specific topic matches, categorize as 'general'
  return 'general'
}

// Analyze hashtag usage across events to determine dynamic topics/subtopics
function analyzeDynamicTopicsAndSubtopics(eventMap: Map<string, EventMapEntry>): {
  dynamicTopics: string[]
  dynamicSubtopics: string[]
} {
  // Track hashtag usage: hashtag -> { eventIds: Set, npubs: Set }
  const hashtagUsage = new Map<string, { eventIds: Set<string>, npubs: Set<string> }>()
  
  // Analyze all events
  eventMap.forEach((entry) => {
    entry.allTopics.forEach(topic => {
      if (!hashtagUsage.has(topic)) {
        hashtagUsage.set(topic, { eventIds: new Set(), npubs: new Set() })
      }
      const usage = hashtagUsage.get(topic)!
      usage.eventIds.add(entry.event.id)
      usage.npubs.add(entry.event.pubkey)
    })
  })
  
  // Get predefined topic IDs
  const predefinedTopicIds = DISCUSSION_TOPICS.map(t => t.id)
  
  const dynamicTopics: string[] = []
  const dynamicSubtopics: string[] = []
  
  // Analyze each hashtag
  hashtagUsage.forEach((usage, hashtag) => {
    // Skip if it's already a predefined topic
    if (predefinedTopicIds.includes(hashtag)) {
      return
    }
    
    const eventCount = usage.eventIds.size
    const npubCount = usage.npubs.size
    
    // If 10+ events from 10+ different npubs, make it a topic
    if (eventCount >= 10 && npubCount >= 10) {
      dynamicTopics.push(hashtag)
    }
    // If 3+ events from 3+ different npubs, make it a subtopic
    else if (eventCount >= 3 && npubCount >= 3) {
      dynamicSubtopics.push(hashtag)
    }
  })
  
  return { dynamicTopics, dynamicSubtopics }
}

// Function to get dynamic subtopics from event topics
function getSubtopicsFromTopics(topics: string[], limit: number = 3): string[] {
  // Get the main topic IDs from DISCUSSION_TOPICS
  const mainTopicIds = DISCUSSION_TOPICS.map(topic => topic.id)
  
  // Filter out main topic IDs and get unique subtopics
  const subtopics = topics.filter(topic => !mainTopicIds.includes(topic))
  const uniqueSubtopics = [...new Set(subtopics)]
  
  // Return the most common subtopics, limited by the limit
  return uniqueSubtopics.slice(0, limit)
}

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
  const { relaySets, favoriteRelays } = useFavoriteRelays()
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
  
  // Available subtopics for the selected topic
  const [availableSubtopics, setAvailableSubtopics] = useState<string[]>([])

  // State for all available relays
  const [allRelays, setAllRelays] = useState<string[]>([])
  const isFetchingRef = useRef(false)
  const lastFetchTimeRef = useRef(0)

  // Get all available relays (use favorite relays from provider + additional relays)
  useEffect(() => {
    const updateRelays = async () => {
      let userWriteRelays: string[] = []
      
      if (pubkey) {
        try {
          // Get user's write relays
          const relayList = await client.fetchRelayList(pubkey)
          userWriteRelays = relayList?.write || []
        } catch (error) {
          console.warn('Failed to fetch user relay list:', error)
        }
      }
      
      // Use favorite relays from provider (includes stored relay sets) + additional relays
      const allRawRelays = [
        ...favoriteRelays,
        ...userWriteRelays,
        ...FAST_READ_RELAY_URLS
      ]
      
      // Normalize and deduplicate all relays
      const relays = Array.from(new Set(
        allRawRelays
          .map(url => normalizeUrl(url))
          .filter(url => url && url.length > 0) // Remove any empty/invalid URLs
      ))
      
      // Only update if relays actually changed
      setAllRelays(prevRelays => {
        const prevRelaysStr = prevRelays.sort().join(',')
        const newRelaysStr = relays.sort().join(',')
        if (prevRelaysStr === newRelaysStr) {
          return prevRelays // No change, don't trigger re-render
        }
        return relays
      })
    }
    
    // Debounce relay updates to prevent rapid changes
    const timeoutId = setTimeout(updateRelays, 500)
    return () => clearTimeout(timeoutId)
  }, [pubkey, favoriteRelays])

  // State for dynamic topics and subtopics
  const [dynamicTopics, setDynamicTopics] = useState<string[]>([])
  const [dynamicSubtopics, setDynamicSubtopics] = useState<string[]>([])

  // Fetch all kind 11 events from all relays
  const fetchAllEvents = useCallback(async () => {
    // Prevent multiple simultaneous fetches using ref to avoid dependency
    if (isFetchingRef.current) {
      console.log('Already fetching, skipping...')
      return
    }
    
    // Prevent too frequent fetches (minimum 10 seconds between fetches)
    const now = Date.now()
    if (now - lastFetchTimeRef.current < 10000) {
      console.log('Fetch too soon, skipping...')
      return
    }
    
    
    isFetchingRef.current = true
    lastFetchTimeRef.current = now
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
        
        // Extract topics - normalize subtopics but keep originals for topic detection
        const tTagsRaw = event.tags.filter(tag => tag[0] === 't' && tag[1]).map(tag => tag[1].toLowerCase())
        // Match hashtags with letters, numbers, hyphens, and underscores
        const hashtagsRaw = (event.content.match(/#[\w-]+/g) || []).map(tag => tag.slice(1).toLowerCase())
        const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
        
        // Determine the main topic from raw tags (use only predefined topics during fetch)
        const predefinedTopicIds = DISCUSSION_TOPICS.map(t => t.id)
        const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
        
        // Normalize subtopics for grouping (but not main topic IDs)
        const tTags = tTagsRaw.map(tag => normalizeSubtopic(tag))
        const hashtags = hashtagsRaw.map(tag => normalizeSubtopic(tag))
        const allTopics = [...new Set([...tTags, ...hashtags])]
        
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
      
      // Analyze and set dynamic topics/subtopics from the fetched events
      if (finalEventMap.size > 0) {
        const { dynamicTopics: newTopics, dynamicSubtopics: newSubtopics } = analyzeDynamicTopicsAndSubtopics(finalEventMap)
        setDynamicTopics(newTopics)
        setDynamicSubtopics(newSubtopics)
      } else {
        setDynamicTopics([])
        setDynamicSubtopics([])
      }
    } catch (error) {
      console.error('Error fetching events:', error)
      setEventMap(new Map())
      setDynamicTopics([])
      setDynamicSubtopics([])
    } finally {
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [allRelays])

  // Fetch events on component mount and periodically
  useEffect(() => {
    if (allRelays.length > 0) {
      fetchAllEvents()
      
      // Refetch every 5 minutes
      const interval = setInterval(fetchAllEvents, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [allRelays])

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
        // It's an individual relay - normalize both for comparison
        const normalizedSelectedRelay = normalizeUrl(selectedRelay)
        filtered = events.filter(entry => 
          entry.relaySources.some(source => normalizeUrl(source) === normalizedSelectedRelay)
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
  }, [getFilteredEvents, selectedTopic, selectedSubtopic, selectedSort, searchQuery, viewMode])

  // Update filtered events when dependencies change
  useEffect(() => {
    filterAndSortEvents()
  }, [filterAndSortEvents])


  // Update available subtopics when topic analysis or selected topic changes
  useEffect(() => {
    if (selectedTopic && selectedTopic !== 'all') {
      // Get all topics from events in this topic
      const topicEvents = Array.from(eventMap.values()).filter(entry => entry.categorizedTopic === selectedTopic)
      const allTopics = topicEvents.flatMap(entry => entry.allTopics)
      const subtopics = getSubtopicsFromTopics(allTopics, 10) // Increased limit to show more subtopics
      
      // Add relevant dynamic subtopics for this topic
      const relevantDynamicSubtopics = dynamicSubtopics.filter(subtopic => 
        allTopics.includes(subtopic)
      )
      
      // Combine and deduplicate
      const combinedSubtopics = [...new Set([...subtopics, ...relevantDynamicSubtopics])]
      
      // Special case: Always include 'readings' as a subtopic for 'literature'
      if (selectedTopic === 'literature' && !combinedSubtopics.includes('readings')) {
        combinedSubtopics.unshift('readings')
      }
      
      setAvailableSubtopics(combinedSubtopics)
    } else if (selectedTopic === 'general') {
      // For General topic, show dynamic subtopics that don't belong to other topics
      const generalSubtopics = dynamicSubtopics.filter(subtopic => {
        // Check if this subtopic appears in general-categorized events
        const appearsInGeneral = Array.from(eventMap.values()).some(entry => 
          entry.categorizedTopic === 'general' && entry.allTopics.includes(subtopic)
        )
        return appearsInGeneral
      })
      setAvailableSubtopics(generalSubtopics)
    } else {
      setAvailableSubtopics([])
    }
  }, [eventMap, selectedTopic, dynamicSubtopics])

  const handleCreateThread = () => {
    setShowCreateThread(true)
  }

  const handleThreadCreated = (publishedEvent?: NostrEvent) => {
    setShowCreateThread(false)
    
    // If we have the published event, add it to the map immediately
    if (publishedEvent) {
      console.log('Adding newly published event to display:', publishedEvent.id)
      
      // Extract topics from the published event
      const tTagsRaw = publishedEvent.tags.filter(tag => tag[0] === 't' && tag[1]).map(tag => tag[1].toLowerCase())
      const hashtagsRaw = (publishedEvent.content.match(/#[\w-]+/g) || []).map(tag => tag.slice(1).toLowerCase())
      const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
      
      // Determine the main topic from raw tags
      const predefinedTopicIds = DISCUSSION_TOPICS.map(t => t.id)
      const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
      
      // Normalize subtopics for grouping
      const tTags = tTagsRaw.map(tag => normalizeSubtopic(tag))
      const hashtags = hashtagsRaw.map(tag => normalizeSubtopic(tag))
        const allTopics = [...new Set([...tTags, ...hashtags])]
      
      // Get relay sources from event hints (tracked during publishing)
      let relaySources = client.getEventHints(publishedEvent.id)
      
      // If no hints yet (timing issue), use the relay statuses from the published event
      if (relaySources.length === 0 && (publishedEvent as any).relayStatuses) {
        const successfulRelays = (publishedEvent as any).relayStatuses
          .filter((status: any) => status.success)
          .map((status: any) => status.url)
        if (successfulRelays.length > 0) {
          relaySources = successfulRelays
        }
      }
      
      // If still no sources, use the selected relay or all relays
      if (relaySources.length === 0) {
        relaySources = selectedRelay ? [selectedRelay] : allRelays.slice(0, 3)
      }
      
      console.log('Using relay sources:', relaySources)
      
      // Ensure the event hints are properly set for navigation
      // This is important for the toNote() function to include relay hints in the URL
      if (relaySources.length > 0) {
        console.log('Tracking event on relays for navigation:', relaySources)
        // Create a temporary relay object to track the event
        relaySources.forEach(relayUrl => {
          try {
            // Import the Relay class from nostr-tools
            const { Relay } = require('nostr-tools')
            const tempRelay = new Relay(relayUrl)
            client.trackEventSeenOn(publishedEvent.id, tempRelay)
            console.log(`Tracked event ${publishedEvent.id} on relay ${relayUrl}`)
          } catch (error) {
            console.warn('Failed to create relay object for tracking:', relayUrl, error)
          }
        })
        
        // Verify the hints are set
        const hints = client.getEventHints(publishedEvent.id)
        console.log('Event hints after tracking:', hints)
      }
      
      // Add to event map
      setEventMap(prev => {
        const newMap = new Map(prev)
        newMap.set(publishedEvent.id, {
          event: publishedEvent,
          relaySources,
          tTags,
          hashtags,
          allTopics,
          categorizedTopic
        })
        return newMap
      })
      
      // Also update dynamic topics/subtopics if needed
      setDynamicTopics(prev => {
        const newTopics = [...prev]
        allTopics.forEach(topic => {
          if (!predefinedTopicIds.includes(topic) && !newTopics.includes(topic)) {
            // This is a simplified check - full implementation would check counts
            newTopics.push(topic)
          }
        })
        return newTopics
      })
    }
    
    // Also refetch in the background to ensure we have the latest
    setTimeout(() => fetchAllEvents(), 2000) // Wait 2 seconds for the event to propagate
  }

  return (
    <PrimaryPageLayout
      ref={ref}
      pageName="discussions"
      titlebar={
        <div className="flex gap-1 items-center h-full justify-between">
          <div className="flex gap-1 items-center">
            <TopicFilter
              topics={[
                ...DISCUSSION_TOPICS,
                // Add dynamic topics with Hash icon
                ...dynamicTopics.map(topic => ({
                  id: topic,
                  label: topic.charAt(0).toUpperCase() + topic.slice(1),
                  icon: Hash
                }))
              ]}
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
              // Skip if no events
              if (topicEvents.length === 0) return null
              
              // Try to find topic info in predefined topics, otherwise create dynamic one
              let topicInfo = DISCUSSION_TOPICS.find(t => t.id === topicId)
              if (!topicInfo) {
                // Check if it's a dynamic topic
                if (dynamicTopics.includes(topicId)) {
                  topicInfo = {
                    id: topicId,
                    label: topicId.charAt(0).toUpperCase() + topicId.slice(1),
                    icon: Hash
                  }
                } else {
                  console.warn(`Topic info not found for: ${topicId}`)
                  return null
                }
              }
              
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
                        : getSubtopicsFromTopics(entry?.allTopics || [], 3)
                      
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
                : getSubtopicsFromTopics(entry?.allTopics || [], 3)
              
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
