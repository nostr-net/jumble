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
import CreateThreadDialog, { DISCUSSION_TOPICS } from '@/pages/primary/DiscussionsPage/CreateThreadDialog'
import { NostrEvent } from 'nostr-tools'
import client from '@/services/client.service'

const DiscussionsPage = forwardRef((_, ref) => {
  const { t } = useTranslation()
  const { favoriteRelays } = useFavoriteRelays()
  const { pubkey } = useNostr()
  const [selectedTopic, setSelectedTopic] = useState('general')
  const [selectedRelay, setSelectedRelay] = useState<string | null>(null)
  const [threads, setThreads] = useState<NostrEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [showCreateThread, setShowCreateThread] = useState(false)

  // Use DEFAULT_FAVORITE_RELAYS for logged-out users, or user's favorite relays for logged-in users
  const availableRelays = pubkey && favoriteRelays.length > 0 ? favoriteRelays : DEFAULT_FAVORITE_RELAYS

  useEffect(() => {
    fetchThreads()
  }, [selectedTopic, selectedRelay])

  const fetchThreads = async () => {
    setLoading(true)
    try {
      // Filter by relay if selected, otherwise use all available relays
      const relayUrls = selectedRelay ? [selectedRelay] : availableRelays
      
      const events = await client.fetchEvents(relayUrls, [
        {
          kinds: [11], // Thread events
          '#t': [selectedTopic],
          '#-': ['-'], // Must have the "-" tag for relay privacy
          limit: 50
        }
      ])

      // Filter and sort threads
      const filteredThreads = events
        .filter(event => {
          // Ensure it has a title tag
          const titleTag = event.tags.find(tag => tag[0] === 'title' && tag[1])
          return titleTag && event.content.trim().length > 0
        })
        .sort((a, b) => b.created_at - a.created_at)

      setThreads(filteredThreads)
    } catch (error) {
      console.error('Error fetching threads:', error)
      setThreads([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateThread = () => {
    setShowCreateThread(true)
  }

  const handleThreadCreated = () => {
    setShowCreateThread(false)
    fetchThreads() // Refresh the list
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
            {t('Discussions')} - {DISCUSSION_TOPICS.find(t => t.id === selectedTopic)?.label}
          </h1>
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
                {t('Be the first to start a discussion in this topic!')}
              </p>
              <Button onClick={handleCreateThread}>
                <MessageSquarePlus className="w-4 h-4 mr-2" />
                {t('Create Thread')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {threads.map(thread => (
              <ThreadCard
                key={thread.id}
                thread={thread}
                onThreadClick={() => {
                  // TODO: Navigate to thread detail view
                  console.log('Open thread:', thread.id)
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
          onClose={() => setShowCreateThread(false)}
          onThreadCreated={handleThreadCreated}
        />
      )}
    </PrimaryPageLayout>
  )
})

DiscussionsPage.displayName = 'DiscussionsPage'
export default DiscussionsPage

