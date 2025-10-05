import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DEFAULT_FAVORITE_RELAYS, FAST_READ_RELAY_URLS } from '@/constants'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useNostr } from '@/providers/NostrProvider'
import { forwardRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PrimaryPageLayout from '@/layouts/PrimaryPageLayout'
import { MessageSquarePlus } from 'lucide-react'
import ThreadCard from '@/pages/primary/DiscussionsPage/ThreadCard'
import TopicFilter from '@/pages/primary/DiscussionsPage/TopicFilter'
import ThreadSort, { SortOption } from '@/pages/primary/DiscussionsPage/ThreadSort'
import CreateThreadDialog, { DISCUSSION_TOPICS } from '@/pages/primary/DiscussionsPage/CreateThreadDialog'
import { NostrEvent } from 'nostr-tools'
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { useSecondaryPage } from '@/PageManager'
import { toNote } from '@/lib/link'
import { kinds } from 'nostr-tools'

const DiscussionsPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { favoriteRelays } = useFavoriteRelays()
  const { pubkey } = useNostr()
  const { push } = useSecondaryPage()
  const [selectedTopic, setSelectedTopic] = useState('general')
  const [selectedRelay, setSelectedRelay] = useState<string | null>(null)
  const [selectedSort, setSelectedSort] = useState<SortOption>('newest')
  const [allThreads, setAllThreads] = useState<NostrEvent[]>([])
  const [threads, setThreads] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateThread, setShowCreateThread] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [customVoteStats, setCustomVoteStats] = useState<Record<string, { upvotes: number; downvotes: number; score: number; controversy: number }>>({})

  // Use DEFAULT_FAVORITE_RELAYS for logged-out users, or user's favorite relays for logged-in users
  const availableRelays = pubkey && favoriteRelays.length > 0 ? favoriteRelays : DEFAULT_FAVORITE_RELAYS

  // Available topic IDs for matching
  const availableTopicIds = DISCUSSION_TOPICS.map(topic => topic.id)

  // Custom function to fetch vote stats from selected relays only
  const fetchVoteStatsFromRelays = async (thread: NostrEvent, relayUrls: string[]) => {
    try {
      const reactions = await client.fetchEvents(relayUrls, [
        {
          '#e': [thread.id],
          kinds: [kinds.Reaction],
          limit: 500
        }
      ])
      
      // Filter for up/down vote reactions only
      const upvotes = reactions.filter(r => r.content === '⬆️')
      const downvotes = reactions.filter(r => r.content === '⬇️')
      
      return {
        upvotes: upvotes.length,
        downvotes: downvotes.length,
        score: upvotes.length - downvotes.length,
        controversy: Math.min(upvotes.length, downvotes.length)
      }
    } catch (error) {
      console.error('Error fetching vote stats for thread', thread.id, error)
      return { upvotes: 0, downvotes: 0, score: 0, controversy: 0 }
    }
  }

  // Helper function to get vote score for a thread
  const getThreadVoteScore = (thread: NostrEvent) => {
    // Use custom vote stats if available (from selected relays), otherwise fall back to noteStatsService
    if (customVoteStats[thread.id]) {
      const stats = customVoteStats[thread.id]
      console.log(`Thread ${thread.id}: upvotes=${stats.upvotes}, downvotes=${stats.downvotes}, score=${stats.score} (custom)`)
      return stats.score
    }
    
    const stats = noteStatsService.getNoteStats(thread.id)
    if (!stats?.likes) {
      console.log(`No stats for thread ${thread.id}`)
      return 0
    }
    
    const upvoteReactions = stats.likes.filter(r => r.emoji === '⬆️')
    const downvoteReactions = stats.likes.filter(r => r.emoji === '⬇️')
    const score = upvoteReactions.length - downvoteReactions.length
    
    console.log(`Thread ${thread.id}: upvotes=${upvoteReactions.length}, downvotes=${downvoteReactions.length}, score=${score} (fallback)`)
    return score
  }

  // Helper function to get controversy score (high upvotes AND downvotes)
  const getThreadControversyScore = (thread: NostrEvent) => {
    // Use custom vote stats if available (from selected relays), otherwise fall back to noteStatsService
    if (customVoteStats[thread.id]) {
      const stats = customVoteStats[thread.id]
      console.log(`Thread ${thread.id}: upvotes=${stats.upvotes}, downvotes=${stats.downvotes}, controversy=${stats.controversy} (custom)`)
      return stats.controversy
    }
    
    const stats = noteStatsService.getNoteStats(thread.id)
    if (!stats?.likes) {
      console.log(`No stats for thread ${thread.id}`)
      return 0
    }
    
    const upvoteReactions = stats.likes.filter(r => r.emoji === '⬆️')
    const downvoteReactions = stats.likes.filter(r => r.emoji === '⬇️')
    
    // Controversy = minimum of upvotes and downvotes (both need to be high)
    const controversy = Math.min(upvoteReactions.length, downvoteReactions.length)
    console.log(`Thread ${thread.id}: upvotes=${upvoteReactions.length}, downvotes=${downvoteReactions.length}, controversy=${controversy} (fallback)`)
    return controversy
  }

  // Helper function to get total zap amount for a thread
  const getThreadZapAmount = (thread: NostrEvent) => {
    const stats = noteStatsService.getNoteStats(thread.id)
    if (!stats?.zaps) {
      return 0
    }
    
    const totalAmount = stats.zaps.reduce((sum, zap) => sum + zap.amount, 0)
    console.log(`Thread ${thread.id}: ${stats.zaps.length} zaps, total amount: ${totalAmount}`)
    return totalAmount
  }

  useEffect(() => {
    setCustomVoteStats({}) // Clear custom stats when relay changes
    fetchAllThreads()
  }, [selectedRelay])

  useEffect(() => {
    // Only wait for stats for vote-based sorting
    if ((selectedSort === 'top' || selectedSort === 'controversial') && !statsLoaded) {
      console.log('Waiting for stats to load before sorting...')
      return
    }
    console.log('Running filterThreadsByTopic with selectedSort:', selectedSort, 'statsLoaded:', statsLoaded)
    filterThreadsByTopic()
  }, [allThreads, selectedTopic, selectedSort, statsLoaded])

  // Fetch stats when sort changes to top/controversial
  useEffect(() => {
    if ((selectedSort === 'top' || selectedSort === 'controversial') && allThreads.length > 0) {
      setStatsLoaded(false)
      console.log('Fetching vote stats for', allThreads.length, 'threads from relays:', selectedRelay || availableRelays)
      
      // Use the same relay selection as thread fetching
      const relayUrls = selectedRelay ? [selectedRelay] : availableRelays
      
      // Fetch custom vote stats from selected relays only
      const statsPromises = allThreads.map(async (thread) => {
        try {
          const stats = await fetchVoteStatsFromRelays(thread, relayUrls)
          return { threadId: thread.id, stats }
        } catch (error) {
          console.error('Error fetching stats for thread', thread.id, error)
          return { threadId: thread.id, stats: { upvotes: 0, downvotes: 0, score: 0, controversy: 0 } }
        }
      })
      
      Promise.allSettled(statsPromises).then((results) => {
        const successful = results.filter(r => r.status === 'fulfilled').length
        console.log(`Vote stats fetch completed: ${successful}/${results.length} successful`)
        
        // Store the custom vote stats
        const newCustomStats: Record<string, { upvotes: number; downvotes: number; score: number; controversy: number }> = {}
        results.forEach(result => {
          if (result.status === 'fulfilled') {
            newCustomStats[result.value.threadId] = result.value.stats
          }
        })
        
        setCustomVoteStats(newCustomStats)
        setStatsLoaded(true)
      })
    } else {
      setStatsLoaded(true) // For non-vote-based sorting, stats don't matter
      console.log('Set statsLoaded to true for non-vote sorting')
    }
  }, [selectedSort, allThreads, selectedRelay, availableRelays])

  const fetchAllThreads = async () => {
    setLoading(true)
    try {
      // Filter by relay if selected, otherwise use all available relays plus fast read relays
      const relayUrls = selectedRelay ? [selectedRelay] : Array.from(new Set([...availableRelays, ...FAST_READ_RELAY_URLS]))
      
      // Fetch all kind 11 events (limit 100, newest first) with relay source tracking
      console.log('Fetching kind 11 events from relays:', relayUrls)
      // Fetch recent kind 11 events (last 30 days)
      const thirtyDaysAgo = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000)
      
      const events = await client.fetchEvents(relayUrls, [
        {
          kinds: [11], // Thread events
          since: thirtyDaysAgo, // Only fetch events from last 30 days
          limit: 100
        }
      ])
      console.log('Fetched kind 11 events:', events.length, events.map(e => ({ id: e.id, title: e.tags.find(t => t[0] === 'title')?.[1], pubkey: e.pubkey })))
      
      // Debug: Show date range of fetched events
      if (events.length > 0) {
        const dates = events.map(e => new Date(e.created_at * 1000))
        const newest = new Date(Math.max(...dates.map(d => d.getTime())))
        const oldest = new Date(Math.min(...dates.map(d => d.getTime())))
        console.log(`Date range: ${oldest.toISOString()} to ${newest.toISOString()}`)
        console.log(`Current time: ${new Date().toISOString()}`)
        console.log(`Newest thread is ${Math.floor((Date.now() - newest.getTime()) / (1000 * 60 * 60 * 24))} days old`)
      } else {
        console.log('No recent events found, fetching all events...')
        // If no recent events, fetch all events without time filter
        const allEvents = await client.fetchEvents(relayUrls, [
          {
            kinds: [11], // Thread events
            limit: 100
          }
        ])
        console.log('Fetched all kind 11 events:', allEvents.length)
        if (allEvents.length > 0) {
          const dates = allEvents.map(e => new Date(e.created_at * 1000))
          const newest = new Date(Math.max(...dates.map(d => d.getTime())))
          const oldest = new Date(Math.min(...dates.map(d => d.getTime())))
          console.log(`All events date range: ${oldest.toISOString()} to ${newest.toISOString()}`)
          console.log(`Newest thread is ${Math.floor((Date.now() - newest.getTime()) / (1000 * 60 * 60 * 24))} days old`)
        }
        return // Use the events we already fetched
      }

      // Filter and sort threads, adding relay source information
      const validThreads = events
        .filter(event => {
          // Ensure it has a title tag
          const titleTag = event.tags.find(tag => tag[0] === 'title' && tag[1])
          return titleTag && event.content.trim().length > 0
        })
        .map(event => ({
          ...event,
          _relaySource: selectedRelay || 'multiple' // Track which relay(s) it was found on
        }))

      setAllThreads(validThreads)
      
      // Fetch stats for all threads to enable proper sorting
      if (selectedSort === 'top' || selectedSort === 'controversial') {
        // Fetch stats for all threads in parallel
        const statsPromises = validThreads.map(thread => 
          noteStatsService.fetchNoteStats(thread, pubkey)
        )
        await Promise.allSettled(statsPromises)
      }
    } catch (error) {
      console.error('Error fetching threads:', error)
      setAllThreads([])
    } finally {
      setLoading(false)
    }
  }

  const filterThreadsByTopic = () => {
    const categorizedThreads = allThreads.map(thread => {
      // Find all 't' tags in the thread
      const topicTags = thread.tags.filter(tag => tag[0] === 't' && tag[1])
      
      // Find the first matching topic from our available topics
      let matchedTopic = 'general' // Default to general
      
      for (const topicTag of topicTags) {
        if (availableTopicIds.includes(topicTag[1])) {
          matchedTopic = topicTag[1]
          break // Use the first match found
        }
      }
      
      return {
        ...thread,
        _categorizedTopic: matchedTopic
      }
    })

    // Filter threads for the selected topic (or show all if "all" is selected)
    let threadsForTopic = selectedTopic === 'all' 
      ? categorizedThreads.map(thread => {
          // Remove the temporary categorization property but keep relay source
          const { _categorizedTopic, ...cleanThread } = thread
          return cleanThread
        })
      : categorizedThreads
          .filter(thread => thread._categorizedTopic === selectedTopic)
          .map(thread => {
            // Remove the temporary categorization property but keep relay source
            const { _categorizedTopic, ...cleanThread } = thread
            return cleanThread
          })

    // Apply sorting based on selectedSort
    console.log('Sorting by:', selectedSort, 'with', threadsForTopic.length, 'threads')
    
    // Debug: show timestamps before sorting
    if (selectedSort === 'newest' || selectedSort === 'oldest') {
      console.log('Timestamps before sorting:', threadsForTopic.map(t => ({
        id: t.id.slice(0, 8),
        created_at: t.created_at,
        date: new Date(t.created_at * 1000).toISOString()
      })))
    }
    
    switch (selectedSort) {
      case 'newest':
        console.log('BEFORE newest sort - first 3 threads:', threadsForTopic.slice(0, 3).map(t => ({
          id: t.id.slice(0, 8),
          created_at: t.created_at,
          date: new Date(t.created_at * 1000).toISOString()
        })))
        
        // Create a new sorted array instead of mutating
        const sortedNewest = [...threadsForTopic].sort((a, b) => {
          const result = b.created_at - a.created_at
          console.log(`Comparing ${a.id.slice(0,8)} (${new Date(a.created_at * 1000).toISOString()}) vs ${b.id.slice(0,8)} (${new Date(b.created_at * 1000).toISOString()}) = ${result}`)
          return result
        })
        
        // Replace the original array
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedNewest)
        
        console.log('AFTER newest sort - first 3 threads:', threadsForTopic.slice(0, 3).map(t => ({
          id: t.id.slice(0, 8),
          created_at: t.created_at,
          date: new Date(t.created_at * 1000).toISOString()
        })))
        break
      case 'oldest':
        // Create a new sorted array instead of mutating
        const sortedOldest = [...threadsForTopic].sort((a, b) => a.created_at - b.created_at)
        
        // Replace the original array
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedOldest)
        
        console.log('Sorted by oldest - first thread created_at:', new Date(threadsForTopic[0]?.created_at * 1000), 'last thread created_at:', new Date(threadsForTopic[threadsForTopic.length - 1]?.created_at * 1000))
        break
      case 'top':
        // Sort by vote score (upvotes - downvotes), then by newest if tied
        const sortedTop = [...threadsForTopic].sort((a, b) => {
          const scoreA = getThreadVoteScore(a)
          const scoreB = getThreadVoteScore(b)
          console.log(`Comparing ${a.id.slice(0,8)} (score: ${scoreA}) vs ${b.id.slice(0,8)} (score: ${scoreB})`)
          if (scoreA !== scoreB) {
            return scoreB - scoreA // Higher scores first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
        
        // Replace the original array
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedTop)
        
        console.log('Sorted by top (vote score)')
        break
      case 'controversial':
        // Sort by controversy score (min of upvotes and downvotes), then by newest if tied
        const sortedControversial = [...threadsForTopic].sort((a, b) => {
          const controversyA = getThreadControversyScore(a)
          const controversyB = getThreadControversyScore(b)
          console.log(`Comparing ${a.id.slice(0,8)} (controversy: ${controversyA}) vs ${b.id.slice(0,8)} (controversy: ${controversyB})`)
          if (controversyA !== controversyB) {
            return controversyB - controversyA // Higher controversy first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
        
        // Replace the original array
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedControversial)
        
        console.log('Sorted by controversial')
        break
      case 'most-zapped':
        // Sort by total zap amount, then by newest if tied
        const sortedMostZapped = [...threadsForTopic].sort((a, b) => {
          const zapAmountA = getThreadZapAmount(a)
          const zapAmountB = getThreadZapAmount(b)
          console.log(`Comparing ${a.id.slice(0,8)} (zaps: ${zapAmountA}) vs ${b.id.slice(0,8)} (zaps: ${zapAmountB})`)
          if (zapAmountA !== zapAmountB) {
            return zapAmountB - zapAmountA // Higher zap amounts first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
        
        // Replace the original array
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedMostZapped)
        
        console.log('Sorted by most zapped')
        break
      default:
        const sortedDefault = [...threadsForTopic].sort((a, b) => b.created_at - a.created_at)
        threadsForTopic.length = 0
        threadsForTopic.push(...sortedDefault)
        console.log('Sorted by default (newest)')
    }

    setThreads(threadsForTopic)
  }

  const handleCreateThread = () => {
    setShowCreateThread(true)
  }

  const handleThreadCreated = () => {
    setShowCreateThread(false)
    fetchAllThreads() // Refresh all threads
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
              onTopicChange={setSelectedTopic}
              threads={threads}
              replies={[]}
            />
            {availableRelays.length > 1 && (
              <select
                value={selectedRelay || ''}
                onChange={(e) => setSelectedRelay(e.target.value || null)}
                className="px-3 h-10 rounded border bg-background text-sm"
              >
                <option value="">All Relays</option>
                {availableRelays.map(relay => (
                  <option key={relay} value={relay}>
                    {relay.replace('wss://', '').replace('ws://', '')}
                  </option>
                ))}
              </select>
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
          <h1 className="text-2xl font-bold">
            {t('Discussions')} - {selectedTopic === 'all' ? t('All Topics') : DISCUSSION_TOPICS.find(t => t.id === selectedTopic)?.label}
          </h1>
          <div className="flex items-center gap-2">
            <ThreadSort 
              selectedSort={selectedSort}
              onSortChange={setSelectedSort}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="text-muted-foreground">{t('Loading threads...')}</div>
          </div>
        ) : threads.length === 0 ? (
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
                <Button variant="outline" onClick={fetchAllThreads}>
                  {t('Refresh')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threads.map(thread => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onThreadClick={() => {
                  push(toNote(thread))
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showCreateThread && (
        <CreateThreadDialog
          topic={selectedTopic}
          availableRelays={availableRelays}
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

