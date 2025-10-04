import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DEFAULT_FAVORITE_RELAYS } from '@/constants'
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
import { useSecondaryPage } from '@/PageManager'
import { toNote } from '@/lib/link'

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

  // Use DEFAULT_FAVORITE_RELAYS for logged-out users, or user's favorite relays for logged-in users
  const availableRelays = pubkey && favoriteRelays.length > 0 ? favoriteRelays : DEFAULT_FAVORITE_RELAYS

  // Available topic IDs for matching
  const availableTopicIds = DISCUSSION_TOPICS.map(topic => topic.id)

  useEffect(() => {
    fetchAllThreads()
  }, [selectedRelay])

  useEffect(() => {
    filterThreadsByTopic()
  }, [allThreads, selectedTopic, selectedSort])

  const fetchAllThreads = async () => {
    setLoading(true)
    try {
      // Filter by relay if selected, otherwise use all available relays
      const relayUrls = selectedRelay ? [selectedRelay] : availableRelays
      
      // Fetch all kind 11 events (limit 100, newest first) with relay source tracking
      console.log('Fetching kind 11 events from relays:', relayUrls)
      const events = await client.fetchEvents(relayUrls, [
        {
          kinds: [11], // Thread events
          limit: 100
        }
      ])
      console.log('Fetched kind 11 events:', events.length, events.map(e => ({ id: e.id, title: e.tags.find(t => t[0] === 'title')?.[1], pubkey: e.pubkey })))

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
        .sort((a, b) => b.created_at - a.created_at) // Sort by newest first (will be overridden by vote-based sorting in the UI)

      setAllThreads(validThreads)
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
    switch (selectedSort) {
      case 'newest':
        threadsForTopic.sort((a, b) => b.created_at - a.created_at)
        break
      case 'oldest':
        threadsForTopic.sort((a, b) => a.created_at - b.created_at)
        break
      case 'top':
        // For now, sort by newest since we don't have vote data readily available
        // TODO: Implement proper vote-based sorting when vote data is available
        threadsForTopic.sort((a, b) => b.created_at - a.created_at)
        break
      case 'controversial':
        // For now, sort by newest since we don't have vote data readily available
        // TODO: Implement controversial sorting (high upvotes AND downvotes)
        threadsForTopic.sort((a, b) => b.created_at - a.created_at)
        break
      default:
        threadsForTopic.sort((a, b) => b.created_at - a.created_at)
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

