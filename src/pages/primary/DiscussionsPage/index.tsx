import { forwardRef, useEffect, useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { useNostr } from '@/providers/NostrProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { NostrEvent, Event as NostrEventType } from 'nostr-tools'
import { kinds } from 'nostr-tools'
import { normalizeUrl } from '@/lib/url'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS } from '@/constants'
import client from '@/services/client.service'
import { DISCUSSION_TOPICS } from './CreateThreadDialog'
import ThreadCard from './ThreadCard'
import CreateThreadDialog from './CreateThreadDialog'

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
  upVotes: number
  downVotes: number
}

// Vote counting function - separate and clean
function countVotesForThread(threadId: string, reactions: NostrEvent[], threadAuthor: string): { upVotes: number, downVotes: number, lastVoteTime: number } {
  const userVotes = new Map<string, { type: string, created_at: number }>()
  let lastVoteTime = 0
  
  // Normalize reaction content according to NIP-25
  const normalizeReaction = (content: string): string => {
    const normalized = content.trim()
    if (normalized === '' || normalized === '+') return '+'
    if (normalized === '-') return '-'
    if (normalized === '⬆️' || normalized === '↑' || normalized === '👍' || normalized === '❤️' || normalized === '🔥') return '+'
    if (normalized === '⬇️' || normalized === '↓' || normalized === '👎' || normalized === '💩') return '-'
    return 'emoji'
  }
  
  // Process all reactions for this thread
  reactions.forEach(reaction => {
    const eTags = reaction.tags.filter(tag => tag[0] === 'e' && tag[1])
    eTags.forEach(tag => {
      if (tag[1] === threadId) {
        // Skip self-votes
        if (reaction.pubkey === threadAuthor) return
        
        const normalizedReaction = normalizeReaction(reaction.content)
        if (normalizedReaction === '+' || normalizedReaction === '-') {
          const existingVote = userVotes.get(reaction.pubkey)
          // Only keep the newest vote from each user
          if (!existingVote || reaction.created_at > existingVote.created_at) {
            userVotes.set(reaction.pubkey, { type: normalizedReaction, created_at: reaction.created_at })
          }
        }
      }
    })
  })
  
  // Count votes
  let upVotes = 0
  let downVotes = 0
  userVotes.forEach(({ type, created_at }) => {
    if (type === '+') upVotes++
    else if (type === '-') downVotes++
    if (created_at > lastVoteTime) lastVoteTime = created_at
  })
  
  return { upVotes, downVotes, lastVoteTime }
}

// Comment counting function - separate and clean
function countCommentsForThread(threadId: string, comments: NostrEvent[], threadAuthor: string): { commentCount: number, lastCommentTime: number } {
  let commentCount = 0
  let lastCommentTime = 0
  
  comments.forEach(comment => {
    const eTags = comment.tags.filter(tag => tag[0] === 'e' && tag[1])
    eTags.forEach(tag => {
      if (tag[1] === threadId) {
        // Skip self-comments
        if (comment.pubkey === threadAuthor) return
        
        commentCount++
        if (comment.created_at > lastCommentTime) {
          lastCommentTime = comment.created_at
        }
      }
    })
  })
  
  return { commentCount, lastCommentTime }
}

// Topic categorization function
function getTopicFromTags(allTopics: string[], predefinedTopicIds: string[]): string {
  for (const topic of allTopics) {
    if (predefinedTopicIds.includes(topic)) {
      return topic
    }
  }
  return 'general'
}

// Normalize topic function
function normalizeTopic(topic: string): string {
  return topic.toLowerCase().replace(/\s+/g, '-')
}

const DiscussionsPage = forwardRef(() => {
  const { t } = useTranslation()
  const { favoriteRelays, blockedRelays } = useFavoriteRelays()
  const { pubkey } = useNostr()
  
  // State
  const [allEventMap, setAllEventMap] = useState<Map<string, EventMapEntry>>(new Map())
  const [eventMap, setEventMap] = useState<Map<string, EventMapEntry>>(new Map())
  const [timeSpan, setTimeSpan] = useState<'30days' | '90days' | 'all'>('30days')
  const [timeSpanCounts, setTimeSpanCounts] = useState<{ '30days': number, '90days': number, 'all': number }>({ '30days': 0, '90days': 0, 'all': 0 })
  const [loading, setLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedTopic, setSelectedTopic] = useState<string>('all')
  
  // Build comprehensive relay list (same as pins)
  const buildComprehensiveRelayList = useCallback(async () => {
    const myRelayList = pubkey ? await client.fetchRelayList(pubkey) : { write: [], read: [] }
    const allRelays = [
      ...(myRelayList.read || []), // User's inboxes (kind 10002)
      ...(myRelayList.write || []), // User's outboxes (kind 10002)
      ...(favoriteRelays || []), // User's favorite relays (kind 10012)
      ...BIG_RELAY_URLS,         // Big relays
      ...FAST_READ_RELAY_URLS,   // Fast read relays
      ...FAST_WRITE_RELAY_URLS   // Fast write relays
    ]
    
    // Normalize and deduplicate relay URLs
    const normalizedRelays = allRelays
          .map(url => normalizeUrl(url))
      .filter((url): url is string => !!url)
    
    // Filter blocked relays
    const finalRelays = normalizedRelays.filter(relay => 
      !blockedRelays.some(blocked => relay.includes(blocked))
    )
    
    console.log('[DiscussionsPage] Using', finalRelays.length, 'comprehensive relays')
    return Array.from(new Set(finalRelays))
  }, []) // Remove dependencies to prevent infinite loop
  
  // Fetch all events
  const fetchAllEvents = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setIsRefreshing(true)
    
    try {
      console.log('[DiscussionsPage] Fetching all discussion threads...')
      
      // Get comprehensive relay list
      const allRelays = await buildComprehensiveRelayList()
      
      // Step 1: Fetch all discussion threads (kind 11)
      const discussionThreads = await client.fetchEvents(allRelays, [
        {
          kinds: [11], // ExtendedKind.DISCUSSION
          limit: 500
        }
      ])
      
      console.log('[DiscussionsPage] Fetched', discussionThreads.length, 'discussion threads')
      
      // Step 2: Get thread IDs and fetch related comments and reactions
      const threadIds = discussionThreads.map((thread: NostrEvent) => thread.id)
      
      const [comments, reactions] = await Promise.all([
        threadIds.length > 0 ? client.fetchEvents(allRelays, [
          {
            kinds: [1111], // ExtendedKind.COMMENT
            '#e': threadIds,
            limit: 1000
          }
        ]) : Promise.resolve([]),
        threadIds.length > 0 ? client.fetchEvents(allRelays, [
          {
            kinds: [kinds.Reaction],
            '#e': threadIds,
              limit: 1000
            }
        ]) : Promise.resolve([])
      ])
      
      console.log('[DiscussionsPage] Fetched', comments.length, 'comments and', reactions.length, 'reactions')
      
      // Debug: Log some reaction details
      if (reactions.length > 0) {
        console.log('[DiscussionsPage] Sample reactions:', reactions.slice(0, 3).map(r => ({
          id: r.id.substring(0, 8),
          content: r.content,
          pubkey: r.pubkey.substring(0, 8),
          tags: r.tags.filter(t => t[0] === 'e')
        })))
      }
      
      // Step 3: Build event map with vote and comment counts
      const newEventMap = new Map<string, EventMapEntry>()
      
      discussionThreads.forEach((thread: NostrEvent) => {
        const threadId = thread.id
        const threadAuthor = thread.pubkey
        
        // Count votes and comments
        const voteStats = countVotesForThread(threadId, reactions, threadAuthor)
        const commentStats = countCommentsForThread(threadId, comments, threadAuthor)
        
        // Debug: Log vote stats for threads with votes
        if (voteStats.upVotes > 0 || voteStats.downVotes > 0) {
          console.log('[DiscussionsPage] Thread', threadId.substring(0, 8), 'has votes:', voteStats)
        }
        
        // Extract topics
        const tTagsRaw = thread.tags.filter((tag: string[]) => tag[0] === 't' && tag[1]).map((tag: string[]) => tag[1].toLowerCase())
        const hashtagsRaw = (thread.content.match(/#\w+/g) || []).map((tag: string) => tag.slice(1).toLowerCase())
        const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
        
        // Categorize topic
        const predefinedTopicIds = DISCUSSION_TOPICS.map((t: any) => t.id)
        const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
        
        // Normalize topics
        const tTags = tTagsRaw.map((tag: string) => normalizeTopic(tag))
        const hashtags = hashtagsRaw.map((tag: string) => normalizeTopic(tag))
        const allTopics = [...new Set([...tTags, ...hashtags])]
        
        // Get relay sources
        const eventHints = client.getEventHints(threadId)
        const relaySources = eventHints.length > 0 ? eventHints : ['unknown']
        
        newEventMap.set(threadId, {
          event: thread,
          relaySources,
          tTags,
          hashtags,
          allTopics,
          categorizedTopic,
          commentCount: commentStats.commentCount,
          lastCommentTime: commentStats.lastCommentTime,
          lastVoteTime: voteStats.lastVoteTime,
          upVotes: voteStats.upVotes,
          downVotes: voteStats.downVotes
        })
      })
      
      console.log('[DiscussionsPage] Built event map with', newEventMap.size, 'threads')
      
      // Log vote counts for debugging
      newEventMap.forEach((entry, threadId) => {
        if (entry.upVotes > 0 || entry.downVotes > 0) {
          console.log('[DiscussionsPage] Thread', threadId.substring(0, 8) + '...', 'has', entry.upVotes, 'upvotes,', entry.downVotes, 'downvotes')
        }
      })
      
      setAllEventMap(newEventMap)
      
    } catch (error) {
      console.error('[DiscussionsPage] Error fetching events:', error)
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, []) // Remove dependencies to prevent infinite loop
  
  // Calculate time span counts
  const calculateTimeSpanCounts = useCallback(() => {
    const now = Date.now()
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60 * 1000)
    
    let count30 = 0
    let count90 = 0
    let countAll = 0
    
    allEventMap.forEach((entry) => {
      const threadTime = entry.event.created_at * 1000
      const lastCommentTime = entry.lastCommentTime > 0 ? entry.lastCommentTime * 1000 : 0
      const lastVoteTime = entry.lastVoteTime > 0 ? entry.lastVoteTime * 1000 : 0
      
      // For threads without comments/votes, only use thread creation time
      const mostRecentActivity = Math.max(
        threadTime,
        lastCommentTime,
        lastVoteTime
      )
      
      if (mostRecentActivity > thirtyDaysAgo) count30++
      if (mostRecentActivity > ninetyDaysAgo) count90++
      countAll++
    })
    
    setTimeSpanCounts({ '30days': count30, '90days': count90, 'all': countAll })
  }, [allEventMap])
  
  // Filter event map for display
  const filterEventMapForDisplay = useCallback(() => {
    const now = Date.now()
    const timeSpanAgo = timeSpan === '30days' ? now - (30 * 24 * 60 * 60 * 1000) : 
                       timeSpan === '90days' ? now - (90 * 24 * 60 * 60 * 1000) : 0
    
    const filteredMap = new Map<string, EventMapEntry>()
    
    allEventMap.forEach((entry) => {
      // Filter by time span
      let passesTimeFilter = false
      if (timeSpan === 'all') {
        passesTimeFilter = true
      } else {
        const threadTime = entry.event.created_at * 1000
        const lastCommentTime = entry.lastCommentTime > 0 ? entry.lastCommentTime * 1000 : 0
        const lastVoteTime = entry.lastVoteTime > 0 ? entry.lastVoteTime * 1000 : 0
        
        const mostRecentActivity = Math.max(
          threadTime,
          lastCommentTime,
          lastVoteTime
        )
        
        passesTimeFilter = mostRecentActivity > timeSpanAgo
      }
      
      // Filter by topic
      const passesTopicFilter = selectedTopic === 'all' || entry.categorizedTopic === selectedTopic
      
      if (passesTimeFilter && passesTopicFilter) {
        filteredMap.set(entry.event.id, entry)
      }
    })
    
    setEventMap(filteredMap)
  }, [allEventMap, timeSpan, selectedTopic])
  
  // Effects
  useEffect(() => {
    fetchAllEvents()
  }, []) // Only run once on mount
  
  useEffect(() => {
    if (allEventMap.size > 0) {
      calculateTimeSpanCounts()
    }
  }, [allEventMap]) // Run when allEventMap changes
  
  useEffect(() => {
    if (allEventMap.size > 0) {
      filterEventMapForDisplay()
    }
  }, [allEventMap, timeSpan, selectedTopic]) // Run when allEventMap, timeSpan, or selectedTopic changes
  
  // Get available topics sorted by most recent activity
  const availableTopics = useMemo(() => {
    const topicMap = new Map<string, { count: number, lastActivity: number }>()
    
    allEventMap.forEach((entry) => {
      const topic = entry.categorizedTopic
      const lastActivity = Math.max(
        entry.event.created_at * 1000,
        entry.lastCommentTime > 0 ? entry.lastCommentTime * 1000 : 0,
        entry.lastVoteTime > 0 ? entry.lastVoteTime * 1000 : 0
      )
      
      if (!topicMap.has(topic)) {
        topicMap.set(topic, { count: 0, lastActivity: 0 })
      }
      
      const current = topicMap.get(topic)!
      current.count++
      current.lastActivity = Math.max(current.lastActivity, lastActivity)
    })
    
    // Convert to array and sort by most recent activity
    return Array.from(topicMap.entries())
      .map(([topic, data]) => ({ topic, ...data }))
      .sort((a, b) => b.lastActivity - a.lastActivity)
  }, [allEventMap])
  
  // Group events by topic
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, EventMapEntry[]>()
    
    eventMap.forEach((entry) => {
      const topic = entry.categorizedTopic
      if (!groups.has(topic)) {
        groups.set(topic, [])
      }
      groups.get(topic)!.push(entry)
    })
    
    // Sort groups by predefined order
    const sortedGroups = Array.from(groups.entries()).sort(([a], [b]) => {
      const aIndex = DISCUSSION_TOPICS.findIndex(t => t.id === a)
      const bIndex = DISCUSSION_TOPICS.findIndex(t => t.id === b)
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
      if (aIndex === -1) return 1
      if (bIndex === -1) return -1
      return aIndex - bIndex
    })
    
    return sortedGroups
  }, [eventMap])
  
  // Handle refresh
  const handleRefresh = () => {
    fetchAllEvents()
  }
  
  // Handle create thread
  const handleCreateThread = (publishedEvent?: NostrEventType) => {
    if (!publishedEvent) return
    
    // Add to event map immediately
    const threadId = publishedEvent.id
    const tTagsRaw = publishedEvent.tags.filter((tag: string[]) => tag[0] === 't' && tag[1]).map((tag: string[]) => tag[1].toLowerCase())
    const hashtagsRaw = (publishedEvent.content.match(/#\w+/g) || []).map((tag: string) => tag.slice(1).toLowerCase())
      const allTopicsRaw = [...new Set([...tTagsRaw, ...hashtagsRaw])]
    const predefinedTopicIds = DISCUSSION_TOPICS.map((t: any) => t.id)
      const categorizedTopic = getTopicFromTags(allTopicsRaw, predefinedTopicIds)
    const tTags = tTagsRaw.map((tag: string) => normalizeTopic(tag))
    const hashtags = hashtagsRaw.map((tag: string) => normalizeTopic(tag))
        const allTopics = [...new Set([...tTags, ...hashtags])]
    const eventHints = client.getEventHints(threadId)
    const relaySources = eventHints.length > 0 ? eventHints : ['unknown']
    
    const newEntry: EventMapEntry = {
          event: publishedEvent,
          relaySources,
          tTags,
          hashtags,
          allTopics,
      categorizedTopic,
      commentCount: 0,
      lastCommentTime: 0,
      lastVoteTime: 0,
      upVotes: 0,
      downVotes: 0
    }
    
    setAllEventMap(prev => new Map(prev).set(threadId, newEntry))
    
    // Close the dialog
    setShowCreateDialog(false)
  }
  
  // Handle close dialog
  const handleCloseDialog = () => {
    setShowCreateDialog(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-2xl font-bold">{t('Discussions')}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            {t('Create Thread')}
          </button>
          
          {/* Topic Selection Dropdown */}
          <select 
            value={selectedTopic} 
            onChange={(e) => setSelectedTopic(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Topics ({allEventMap.size})</option>
            {availableTopics.map(({ topic, count }) => (
              <option key={topic} value={topic}>
                {topic} ({count})
              </option>
            ))}
          </select>
          
          {/* Time Span Dropdown */}
          <select 
            value={timeSpan} 
            onChange={(e) => setTimeSpan(e.target.value as '30days' | '90days' | 'all')}
            className="px-3 py-2 bg-white dark:bg-gray-800 text-black dark:text-white border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="30days">30 days ({timeSpanCounts['30days']})</option>
            <option value="90days">90 days ({timeSpanCounts['90days']})</option>
            <option value="all">All found ({timeSpanCounts.all})</option>
          </select>
          
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8">{t('Loading...')}</div>
        ) : (
          <div className="space-y-6">
            {groupedEvents.map(([topic, events]) => (
              <div key={topic}>
                <h2 className="text-lg font-semibold mb-3 capitalize">
                  {topic} ({events.length} {events.length === 1 ? t('thread') : t('threads')})
                    </h2>
                  <div className="space-y-3">
                  {events.map((entry) => (
                      <ThreadCard
                      key={entry.event.id}
                      thread={entry.event}
                      commentCount={entry.commentCount}
                      lastCommentTime={entry.lastCommentTime}
                      lastVoteTime={entry.lastVoteTime}
                      upVotes={entry.upVotes}
                      downVotes={entry.downVotes}
                      onThreadClick={() => console.log('Thread clicked:', entry.event.id)}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Thread Dialog */}
      {showCreateDialog && (
        <CreateThreadDialog
          topic="general"
          availableRelays={[]}
          relaySets={[]}
          onClose={handleCloseDialog}
          onThreadCreated={handleCreateThread} 
        />
      )}
    </div>
  )
})

DiscussionsPage.displayName = 'DiscussionsPage'

export default DiscussionsPage
