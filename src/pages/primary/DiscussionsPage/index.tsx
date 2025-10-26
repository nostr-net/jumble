import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
// Removed dropdown menu import - no longer using relay selection
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS, SEARCHABLE_RELAY_URLS, HASHTAG_REGEX, ExtendedKind } from '@/constants'
import { normalizeUrl } from '@/lib/url'
import { normalizeTopic } from '@/lib/discussion-topics'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import { forwardRef, useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { MessageSquarePlus, Book, BookOpen, Hash, Search, X, RefreshCw } from 'lucide-react'
import ThreadCard from '@/pages/primary/DiscussionsPage/ThreadCard'
import TopicFilter from '@/pages/primary/DiscussionsPage/TopicFilter'
import ThreadSort, { SortOption } from '@/pages/primary/DiscussionsPage/ThreadSort'
import CreateThreadDialog, { DISCUSSION_TOPICS } from '@/pages/primary/DiscussionsPage/CreateThreadDialog'
import ViewToggle from '@/pages/primary/DiscussionsPage/ViewToggle'
import SubtopicFilter from '@/pages/primary/DiscussionsPage/SubtopicFilter'
import TopicSubscribeButton from '@/components/TopicSubscribeButton'
import { NostrEvent } from 'nostr-tools'
import client from '@/services/client.service'
import { useSmartNoteNavigation } from '@/PageManager'
import { toNote } from '@/lib/link'
import { kinds } from 'nostr-tools'


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

// Removed getSubtopicsFromTopics - now using only dynamicSubtopics that meet npub thresholds

// Simple event map type
type EventMapEntry = {
  event: NostrEvent
  relaySources: string[]
  tTags: string[]
  hashtags: string[]
  allTopics: string[]
  categorizedTopic: string
  commentCount: number
  lastCommentTime: number
  lastVoteTime: number
}

const DiscussionsPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { favoriteRelays, blockedRelays } = useFavoriteRelays()
  const { pubkey } = useNostr()
  const { navigateToNote } = useSmartNoteNavigation()
  
  // State management
  const [selectedTopic, setSelectedTopic] = useState('all')
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null)
  // Removed relay filtering - using all relays
  const [selectedSort, setSelectedSort] = useState<SortOption>('newest')
  const [allEventMap, setAllEventMap] = useState<Map<string, EventMapEntry>>(new Map()) // Store all threads
  const [eventMap, setEventMap] = useState<Map<string, EventMapEntry>>(new Map()) // Filtered for display
  const [filteredEvents, setFilteredEvents] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped')
  const [groupedEvents, setGroupedEvents] = useState<Record<string, NostrEvent[]>>({})
  const [searchQuery, setSearchQuery] = useState('')
  
  // Time span selector
  const [timeSpan, setTimeSpan] = useState<'30days' | '90days' | 'all'>('30days')
  
  // Track counts for each time span (calculated from actual filtered results)
  const [timeSpanCounts, setTimeSpanCounts] = useState<{
    '30days': number
    '90days': number
    'all': number
  }>({ '30days': 0, '90days': 0, 'all': 0 })
  
  // Available subtopics for the selected topic
  const [availableSubtopics, setAvailableSubtopics] = useState<string[]>([])

  // State for all available relays
  const [allRelays, setAllRelays] = useState<string[]>([])
  const isFetchingRef = useRef(false)
  const lastFetchTimeRef = useRef(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Get all available relays (use favorite relays from provider + user's read relays or fast read relays)
  useEffect(() => {
    const updateRelays = async () => {
      let userReadRelays: string[] = []
      
      if (pubkey) {
        try {
          // Get user's read relays
          const relayList = await client.fetchRelayList(pubkey)
          userReadRelays = relayList?.read || []
          console.log('[DiscussionsPage] User read relays:', userReadRelays)
        } catch (error) {
          console.warn('Failed to fetch user relay list:', error)
        }
      } else {
        console.log('[DiscussionsPage] No pubkey - using anonymous relay list')
      }
      
      console.log('[DiscussionsPage] Relay sources:')
      console.log('  - SEARCHABLE_RELAY_URLS:', SEARCHABLE_RELAY_URLS.length, 'relays')
      console.log('  - userReadRelays:', userReadRelays.length, 'relays')
      console.log('  - favoriteRelays:', favoriteRelays.length, 'relays')
      console.log('  - BIG_RELAY_URLS:', BIG_RELAY_URLS.length, 'relays')
      console.log('  - FAST_READ_RELAY_URLS:', FAST_READ_RELAY_URLS.length, 'relays')
      console.log('  - FAST_WRITE_RELAY_URLS:', FAST_WRITE_RELAY_URLS.length, 'relays')
      console.log('  - blockedRelays:', blockedRelays.length, 'relays')
      
      // Use a comprehensive relay list for discussions to ensure we get all topics
      // Combine searchable relays + user's read relays + favorite relays + big relays + fast relays
      const allRawRelays = [
        ...SEARCHABLE_RELAY_URLS, // Comprehensive list of searchable relays
        ...userReadRelays,
        ...favoriteRelays,
        ...BIG_RELAY_URLS,         // Big relays
        ...FAST_READ_RELAY_URLS,   // Fast read relays
        ...FAST_WRITE_RELAY_URLS   // Fast write relays
      ]
      
      console.log('[DiscussionsPage] Total raw relays before processing:', allRawRelays.length)
      
      // Normalize and deduplicate all relays
      const normalizedRelays = Array.from(new Set(
        allRawRelays
          .map(url => normalizeUrl(url))
          .filter(url => url && url.length > 0) // Remove any empty/invalid URLs
      ))
      
      console.log('[DiscussionsPage] Normalized relays after deduplication:', normalizedRelays.length)
      
      // Filter out blocked relays
      const relays = normalizedRelays.filter(relay => {
        const normalizedRelay = normalizeUrl(relay) || relay
        return !blockedRelays.some(blocked => {
          const normalizedBlocked = normalizeUrl(blocked) || blocked
          return normalizedBlocked === normalizedRelay
        })
      })
      
      console.log('[DiscussionsPage] Final relay list after blocking filter:', relays.length, 'relays')
      console.log('[DiscussionsPage] Final relays:', relays)
      
      // Only update if relays actually changed
      setAllRelays(prevRelays => {
        const prevRelaysStr = prevRelays.sort().join(',')
        const newRelaysStr = relays.sort().join(',')
        if (prevRelaysStr === newRelaysStr) {
          console.log('[DiscussionsPage] Relays unchanged, skipping update')
          return prevRelays // No change, don't trigger re-render
        }
        console.log('[DiscussionsPage] Relays changed, updating state')
        return relays
      })
    }
    
    // Debounce relay updates to prevent rapid changes
    const timeoutId = setTimeout(updateRelays, 500)
    return () => clearTimeout(timeoutId)
  }, [pubkey, favoriteRelays, blockedRelays])

  // State for dynamic topics and subtopics
  const [dynamicTopics, setDynamicTopics] = useState<string[]>([])
  const [dynamicSubtopics, setDynamicSubtopics] = useState<string[]>([])
  
  // Manual reset function for debugging
  const resetFetchState = useCallback(() => {
    console.log('Manually resetting fetch state')
    isFetchingRef.current = false
    setLoading(false)
  }, [])

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
    
    console.log('[DiscussionsPage] Starting fetchAllEvents...')
    console.log('[DiscussionsPage] Using', allRelays.length, 'relays for fetching:', allRelays)
    
    isFetchingRef.current = true
    lastFetchTimeRef.current = now
    setLoading(true)
    
    // Safety timeout to reset fetch state if it gets stuck
    const safetyTimeout = setTimeout(() => {
      console.warn('[DiscussionsPage] Fetch timeout - resetting fetch state')
      isFetchingRef.current = false
      setLoading(false)
    }, 30000) // 30 second timeout
    try {
      // Time span calculation is now only used in the display filter layer
      
      console.log('[DiscussionsPage] Simplified approach: Fetch all kind 11, then related 1111/7, remove self-responses, process bumping, filter by', timeSpan, 'in display layer')
      console.log('[DiscussionsPage] Fetching all discussion threads (no time limit)')
      
      // Step 1: Fetch all kind 11 (discussion threads) - no time filtering
      const discussionThreads = await client.fetchEvents(allRelays, [
        {
          kinds: [ExtendedKind.DISCUSSION], // Only discussion threads
          limit: 500
        }
      ])
      
      console.log('[DiscussionsPage] Step 1: Fetched', discussionThreads.length, 'discussion threads (kind 11)')
      
      // Step 2: Get all thread IDs to fetch related comments and reactions
      const threadIds = discussionThreads.map(thread => thread.id)
      console.log('[DiscussionsPage] Step 2: Fetching related comments and reactions for', threadIds.length, 'threads')
      
      // Fetch comments (kind 1111) that reference these threads
      const comments = threadIds.length > 0 ? await client.fetchEvents(allRelays, [
        {
          kinds: [ExtendedKind.COMMENT],
          '#e': threadIds,
          limit: 1000
        }
      ]) : []
      
      // Fetch reactions (kind 7) that reference these threads
      const reactions = threadIds.length > 0 ? await client.fetchEvents(allRelays, [
        {
          kinds: [kinds.Reaction],
          '#e': threadIds,
          limit: 1000
        }
      ]) : []
      
      console.log('[DiscussionsPage] Step 2: Fetched', comments.length, 'comments and', reactions.length, 'reactions for existing threads')
      
      // Combine all events for processing
      const events = [...discussionThreads, ...comments, ...reactions]
      
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
      const deletedEventIds = new Set<string>()
      if (eventIds.length > 0) {
        try {
          const deletionEvents = await client.fetchEvents(allRelays, [
            {
              kinds: [kinds.EventDeletion],
              '#e': eventIds,
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
          console.warn('[DiscussionsPage] Failed to fetch deletion events:', error)
        }
      }
      
      console.log('[DiscussionsPage] Found', deletedEventIds.size, 'deleted events')
      console.log('[DiscussionsPage] Processing', newEventMap.size, 'events for final map')
      
      // Step 3: Remove self-responses and Step 4: Process thread bumping
      const threadIdsToFetch = new Set<string>()
      const threadAuthors = new Map<string, string>() // Map thread ID to author pubkey
      
      // First, collect all thread authors to exclude self-activity
      newEventMap.forEach(({ event }) => {
        if (event.kind === ExtendedKind.DISCUSSION) {
          threadAuthors.set(event.id, event.pubkey)
        }
      })
      
      // Step 3: Remove self-responses and identify threads to bump
      newEventMap.forEach(({ event }) => {
        if (event.kind === ExtendedKind.COMMENT || event.kind === kinds.Reaction) {
          // Look for 'e' tags that reference discussion threads
          const eTags = event.tags.filter(tag => tag[0] === 'e' && tag[1])
          eTags.forEach(tag => {
            const threadId = tag[1]
            if (threadId) {
              // Check if this activity is from someone other than the thread author
              const threadAuthor = threadAuthors.get(threadId)
              if (!threadAuthor || event.pubkey !== threadAuthor) {
                // This is a non-self response
                if (!newEventMap.has(threadId)) {
                  // This comment/reaction references a thread we don't have yet - add to bump list
                  threadIdsToFetch.add(threadId)
                }
              }
              // If it's a self-response, we simply don't process it further
            }
          })
        }
      })
      
      console.log('[DiscussionsPage] Found', threadIdsToFetch.size, 'older threads to fetch due to recent comments/reactions (excluding self-activity)')
      
      // Fetch the older threads that have recent activity
      if (threadIdsToFetch.size > 0) {
        try {
          const olderThreads = await client.fetchEvents(allRelays, [
            {
              kinds: [ExtendedKind.DISCUSSION],
              ids: Array.from(threadIdsToFetch),
              limit: 100
            }
          ])
          
          console.log('[DiscussionsPage] Fetched', olderThreads.length, 'older threads due to recent comments')
          
          // Add the older threads to our event map
          olderThreads.forEach(event => {
            const eventHints = client.getEventHints(event.id)
            const relaySources = eventHints.length > 0 ? eventHints : ['unknown']
            
            if (!newEventMap.has(event.id)) {
              newEventMap.set(event.id, { event, relaySources })
            }
          })
        } catch (error) {
          console.warn('[DiscussionsPage] Failed to fetch older threads:', error)
        }
      }
      
      // Analyze comment counts and last activity timestamps for each thread
      const threadStats = new Map<string, { commentCount: number, lastCommentTime: number, lastVoteTime: number }>()
      
      newEventMap.forEach(({ event }) => {
        if (event.kind === ExtendedKind.DISCUSSION) {
          // Initialize thread stats
          threadStats.set(event.id, { commentCount: 0, lastCommentTime: 0, lastVoteTime: 0 })
        }
      })
      
      // Helper function to normalize reaction content according to NIP-25
      const normalizeReactionContent = (content: string): string => {
        const normalized = content.trim()
        
        // NIP-25: Empty string or "+" should be interpreted as "like" or "upvote"
        if (normalized === '' || normalized === '+') {
          return '+'
        }
        
        // NIP-25: "-" should be interpreted as "dislike" or "downvote"
        if (normalized === '-') {
          return '-'
        }
        
        // Normalize common arrow emojis to +/- for consistent counting
        if (normalized === '⬆️' || normalized === '↑' || normalized === '👍' || normalized === '❤️' || normalized === '🔥') {
          return '+'
        }
        
        if (normalized === '⬇️' || normalized === '↓' || normalized === '👎' || normalized === '💩') {
          return '-'
        }
        
        // For other emojis or custom reactions, treat as neutral (don't count as vote)
        return 'emoji'
      }
      
      // Count comments and track last activity times (excluding self-responses)
      newEventMap.forEach(({ event }) => {
        if (event.kind === ExtendedKind.COMMENT || event.kind === kinds.Reaction) {
          const eTags = event.tags.filter(tag => tag[0] === 'e' && tag[1])
          eTags.forEach(tag => {
            const threadId = tag[1]
            if (threadId && threadStats.has(threadId)) {
              // Check if this is a self-response
              const threadAuthor = threadAuthors.get(threadId)
              if (threadAuthor && event.pubkey === threadAuthor) {
                // Skip self-responses
                return
              }
              
              const stats = threadStats.get(threadId)!
              
              if (event.kind === ExtendedKind.COMMENT) {
                stats.commentCount++
                if (event.created_at > stats.lastCommentTime) {
                  stats.lastCommentTime = event.created_at
                }
              } else if (event.kind === kinds.Reaction) {
                // Only count reactions that normalize to +/- as votes
                const normalizedReaction = normalizeReactionContent(event.content)
                if (normalizedReaction === '+' || normalizedReaction === '-') {
                  if (event.created_at > stats.lastVoteTime) {
                    stats.lastVoteTime = event.created_at
                  }
                }
              }
            }
          })
        }
      })
      
      console.log('[DiscussionsPage] Thread stats calculated:', Array.from(threadStats.entries()).map(([id, stats]) => ({ id, ...stats })))
      
      // Step 5: Build the final event map with topic information (90-day filter applied)
      const finalEventMap = new Map<string, EventMapEntry>()
      
      // Step 5: Display kind 11s with activity newer than 90 days
      newEventMap.forEach(({ event, relaySources }, eventId) => {
        // Skip deleted events
        if (deletedEventIds.has(eventId)) {
          return
        }
        
        // Only process discussion threads (kind 11) for display
        if (event.kind !== ExtendedKind.DISCUSSION) {
          return
        }
        
        // Include all threads - filtering will be done in display layer
        
        // Extract topics - normalize subtopics but keep originals for topic detection
        const tTagsRaw = event.tags.filter(tag => tag[0] === 't' && tag[1]).map(tag => tag[1].toLowerCase())
        // Match hashtags using the same regex as everywhere else
        const hashtagsRaw = (event.content.match(HASHTAG_REGEX) || []).map(tag => tag.slice(1).toLowerCase())
        const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
        
        // Determine the main topic from raw tags (use only predefined topics during fetch)
        const predefinedTopicIds = DISCUSSION_TOPICS.map(t => t.id)
        const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
        
        // Debug logging for topics
        if (allTopicsRaw.length === 0) {
          console.log('[DiscussionsPage] Discussion with no topics categorized as:', categorizedTopic, 'Event ID:', event.id)
        }
        
        // Normalize subtopics for grouping (but not main topic IDs)
        const tTags = tTagsRaw.map(tag => normalizeTopic(tag))
        const hashtags = hashtagsRaw.map(tag => normalizeTopic(tag))
        const allTopics = [...new Set([...tTags, ...hashtags])]
        
        // Get thread stats for this event
        const finalStats = threadStats.get(eventId) || { commentCount: 0, lastCommentTime: 0, lastVoteTime: 0 }
        
        finalEventMap.set(eventId, {
          event,
          relaySources,
          tTags,
          hashtags,
          allTopics,
          categorizedTopic,
          commentCount: finalStats.commentCount,
          lastCommentTime: finalStats.lastCommentTime,
          lastVoteTime: finalStats.lastVoteTime
        })
      })
      
      console.log('[DiscussionsPage] Step 6: Final event map size:', finalEventMap.size, 'threads with recent activity')
      console.log('[DiscussionsPage] Final events:', Array.from(finalEventMap.values()).map(e => ({ id: e.event.id, content: e.event.content.substring(0, 100) + '...' })))
      
      // Store all threads in allEventMap (for counting)
      setAllEventMap(finalEventMap)
      
      // Analyze and set dynamic topics/subtopics from the fetched events
      if (finalEventMap.size > 0) {
        const { dynamicTopics: newTopics, dynamicSubtopics: newSubtopics } = analyzeDynamicTopicsAndSubtopics(finalEventMap)
        console.log('[DiscussionsPage] Dynamic topics found:', newTopics)
        console.log('[DiscussionsPage] Dynamic subtopics found:', newSubtopics)
        setDynamicTopics(newTopics)
        setDynamicSubtopics(newSubtopics)
      } else {
        console.log('[DiscussionsPage] No events found, clearing topics')
        setDynamicTopics([])
        setDynamicSubtopics([])
      }
    } catch (error) {
      console.error('[DiscussionsPage] Error fetching events:', error)
      setEventMap(new Map())
      setDynamicTopics([])
      setDynamicSubtopics([])
    } finally {
      clearTimeout(safetyTimeout)
      setLoading(false)
      isFetchingRef.current = false
    }
  }, [allRelays])

  // Calculate counts for all time spans from the all event map
  const calculateTimeSpanCounts = useCallback(() => {
    if (allEventMap.size === 0) {
      setTimeSpanCounts({ '30days': 0, '90days': 0, 'all': 0 })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60)
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60)

    const counts = { '30days': 0, '90days': 0, 'all': 0 }

    // Count threads for each time span based on all event map
    allEventMap.forEach((entry) => {
      const { event, lastCommentTime, lastVoteTime } = entry
      
      // Check if thread has activity within each time span
      const hasActivity30Days = lastCommentTime > thirtyDaysAgo || 
                               lastVoteTime > thirtyDaysAgo ||
                               event.created_at > thirtyDaysAgo
      
      const hasActivity90Days = lastCommentTime > ninetyDaysAgo || 
                               lastVoteTime > ninetyDaysAgo ||
                               event.created_at > ninetyDaysAgo

      if (hasActivity30Days) counts['30days']++
      if (hasActivity90Days) counts['90days']++
      // 'all' should always count every thread in the map
      counts['all']++
    })

    setTimeSpanCounts(counts)
    console.log('[DiscussionsPage] Time span counts calculated from all event map:', counts)
  }, [allEventMap])

  // Fetch events on component mount and periodically
  useEffect(() => {
    if (allRelays.length > 0) {
      fetchAllEvents()
      
      // Refetch every 5 minutes
      const interval = setInterval(fetchAllEvents, 5 * 60 * 1000)
      return () => clearInterval(interval)
    }
  }, [allRelays, timeSpan, fetchAllEvents])

  // Filter allEventMap based on selected timeSpan for display
  const filterEventMapForDisplay = useCallback(() => {
    if (allEventMap.size === 0) {
      setEventMap(new Map())
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60)
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60)

    const filteredMap = new Map<string, EventMapEntry>()

    allEventMap.forEach((entry, eventId) => {
      const { event, lastCommentTime, lastVoteTime } = entry
      
      let shouldInclude = false
      
      switch (timeSpan) {
        case '30days':
          shouldInclude = lastCommentTime > thirtyDaysAgo || 
                         lastVoteTime > thirtyDaysAgo ||
                         event.created_at > thirtyDaysAgo
          break
        case '90days':
          shouldInclude = lastCommentTime > ninetyDaysAgo || 
                         lastVoteTime > ninetyDaysAgo ||
                         event.created_at > ninetyDaysAgo
          break
        case 'all':
          shouldInclude = true // Include all threads
          break
      }

      if (shouldInclude) {
        filteredMap.set(eventId, entry)
      }
    })

    setEventMap(filteredMap)
    console.log('[DiscussionsPage] Filtered event map for display:', filteredMap.size, 'threads for timeSpan:', timeSpan)
  }, [allEventMap, timeSpan])

  // Calculate time span counts when all event map changes
  useEffect(() => {
    calculateTimeSpanCounts()
  }, [calculateTimeSpanCounts])

  // Filter event map for display when allEventMap or timeSpan changes
  useEffect(() => {
    filterEventMapForDisplay()
  }, [filterEventMapForDisplay])

  // Manual refresh function
  const handleManualRefresh = useCallback(async () => {
    if (isFetchingRef.current || allRelays.length === 0) {
      return
    }

    setIsRefreshing(true)
    try {
      await fetchAllEvents()
    } finally {
      setIsRefreshing(false)
    }
  }, [fetchAllEvents, allRelays.length])

  // Simplified filtering - no relay filtering, just return all events
  const getFilteredEvents = useCallback(() => {
    return Array.from(eventMap.values()).map(entry => entry.event)
  }, [eventMap])

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
        
        // Search in author tags
        const authorTag = event.tags.find(tag => tag[0] === 'author' && tag[1])
        if (authorTag && authorTag[1]?.toLowerCase().includes(lowerQuery)) {
          return true
        }
        
        // Search in subject tags (for books)
        const subjectTag = event.tags.find(tag => tag[0] === 'subject' && tag[1])
        if (subjectTag && subjectTag[1]?.toLowerCase().includes(lowerQuery)) {
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
      
      // Debug logging for grouping
      console.log('[DiscussionsPage] Grouped topics:', Object.keys(grouped).map(topic => `${topic}: ${grouped[topic].length}`).join(', '))

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
      // Only show dynamic subtopics that meet the 3-npub threshold
      // Don't use getSubtopicsFromTopics as it doesn't respect npub thresholds
      const relevantDynamicSubtopics = dynamicSubtopics.filter(subtopic => {
        // Check if this subtopic appears in events for this topic
        const topicEvents = Array.from(eventMap.values()).filter(entry => entry.categorizedTopic === selectedTopic)
        const appearsInTopic = topicEvents.some(entry => entry.allTopics.includes(subtopic))
        return appearsInTopic
      })
      
      // Special case: Always include 'readings' as a subtopic for 'literature' if it appears
      if (selectedTopic === 'literature') {
        const topicEvents = Array.from(eventMap.values()).filter(entry => entry.categorizedTopic === selectedTopic)
        const hasReadings = topicEvents.some(entry => entry.allTopics.includes('readings'))
        if (hasReadings && !relevantDynamicSubtopics.includes('readings')) {
          relevantDynamicSubtopics.unshift('readings')
        }
      }
      
      setAvailableSubtopics(relevantDynamicSubtopics)
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
      const hashtagsRaw = (publishedEvent.content.match(HASHTAG_REGEX) || []).map(tag => tag.slice(1).toLowerCase())
      const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
      
      // Determine the main topic from raw tags
      const predefinedTopicIds = DISCUSSION_TOPICS.map(t => t.id)
      const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
      
      // Normalize subtopics for grouping using the same function as ThreadCard
      const tTags = tTagsRaw.map(tag => normalizeTopic(tag))
      const hashtags = hashtagsRaw.map(tag => normalizeTopic(tag))
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
      
      // If still no sources, use first few relays
      if (relaySources.length === 0) {
        relaySources = allRelays.slice(0, 3)
      }
      
      console.log('Using relay sources:', relaySources)
      
      // Note: Event tracking will happen automatically when the event is fetched
      // from the relays during the next fetchAllEvents call. The relaySources
      // are stored in the eventMap so the event can be found and displayed.
      console.log('Event will be tracked automatically on next fetch from relays:', relaySources)
      
      // Debug: Check if the event hints are already set
      const currentHints = client.getEventHints(publishedEvent.id)
      console.log('Current event hints:', currentHints)
      
      // If no hints are set, the event wasn't properly tracked during publishing
      if (currentHints.length === 0) {
        console.warn('Event has no relay hints - navigation may not work properly')
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
          categorizedTopic,
          commentCount: 0,
          lastCommentTime: 0,
          lastVoteTime: 0
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
    // This will help ensure the event is properly tracked on relays
    setTimeout(() => {
      console.log('Background fetch after thread creation')
      fetchAllEvents()
    }, 3000) // Wait 3 seconds for the event to propagate
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
            {/* Removed relay selection dropdown */}
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
            {/* Time Span Selector */}
            <select
              value={timeSpan}
              onChange={(e) => setTimeSpan(e.target.value as '30days' | '90days' | 'all')}
              className="px-2 py-1 text-sm border rounded bg-background"
            >
              <option value="30days">30 days ({timeSpanCounts['30days']})</option>
              <option value="90days">90 days ({timeSpanCounts['90days']})</option>
              <option value="all">All found ({timeSpanCounts['all']})</option>
            </select>
            
            {/* Refresh Button */}
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing || loading}
              className="p-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title={t('Refresh discussions')}
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            
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
                    commentCount={eventMap.get(event.id)?.commentCount || 0}
                    lastCommentTime={eventMap.get(event.id)?.lastCommentTime || 0}
                    lastVoteTime={eventMap.get(event.id)?.lastVoteTime || 0}
                    onThreadClick={() => {
                      navigateToNote(toNote(event))
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
                        commentCount={eventMap.get(event.id)?.commentCount || 0}
                        lastCommentTime={eventMap.get(event.id)?.lastCommentTime || 0}
                        lastVoteTime={eventMap.get(event.id)?.lastVoteTime || 0}
                        onThreadClick={() => {
                          navigateToNote(toNote(event))
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
                <Button variant="outline" onClick={resetFetchState}>
                  Reset Fetch
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
                        : entry?.allTopics || []
                      
                      return (
                        <ThreadCard
                          key={event.id}
                          thread={event}
                          subtopics={threadSubtopics}
                          primaryTopic={entry?.categorizedTopic}
                          commentCount={entry?.commentCount || 0}
                          lastCommentTime={entry?.lastCommentTime || 0}
                          lastVoteTime={entry?.lastVoteTime || 0}
                          onThreadClick={() => {
                            navigateToNote(toNote(event))
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
                : entry?.allTopics || []
              
              return (
                <ThreadCard
                  key={event.id}
                  thread={event}
                  subtopics={threadSubtopics}
                  primaryTopic={entry?.categorizedTopic}
                  commentCount={entry?.commentCount || 0}
                  lastCommentTime={entry?.lastCommentTime || 0}
                  lastVoteTime={entry?.lastVoteTime || 0}
                  onThreadClick={() => {
                    navigateToNote(toNote(event))
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
          relaySets={[]}
          onClose={() => setShowCreateThread(false)}
          onThreadCreated={handleThreadCreated}
        />
      )}
    </PrimaryPageLayout>
  )
})

DiscussionsPage.displayName = 'DiscussionsPage'
export default DiscussionsPage
