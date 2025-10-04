import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User, Clock, Hash, Server } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { truncateText } from '@/lib/utils'
import { DISCUSSION_TOPICS } from './CreateThreadDialog'
import Username from '@/components/Username'
import VoteButtons from '@/components/NoteStats/VoteButtons'

interface ThreadWithRelaySource extends NostrEvent {
  _relaySource?: string
}

interface ThreadCardProps {
  thread: ThreadWithRelaySource
  onThreadClick: () => void
  className?: string
}

export default function ThreadCard({ thread, onThreadClick, className }: ThreadCardProps) {
  const { t } = useTranslation()

  // Extract title from tags
  const titleTag = thread.tags.find(tag => tag[0] === 'title' && tag[1])
  const title = titleTag?.[1] || t('Untitled')

  // Extract topic from tags
  const topicTag = thread.tags.find(tag => tag[0] === 't' && tag[1])
  const topic = topicTag?.[1] || 'general'

  // Get first 250 words of content
  const contentPreview = truncateText(thread.content, 250)

  // Format creation time
  const createdAt = new Date(thread.created_at * 1000)
  const timeAgo = formatDistanceToNow(createdAt, { addSuffix: true })

  // Get topic display info from centralized DISCUSSION_TOPICS
  const getTopicInfo = (topicId: string) => {
    const topic = DISCUSSION_TOPICS.find(t => t.id === topicId)
    return topic || { 
      id: topicId, 
      label: topicId, 
      icon: Hash
    }
  }

  const topicInfo = getTopicInfo(topic)

  // Format relay name for display
  const formatRelayName = (relaySource: string) => {
    if (relaySource === 'multiple') {
      return t('Multiple Relays')
    }
    return relaySource.replace('wss://', '').replace('ws://', '')
  }

  return (
    <Card 
      className={cn(
        'clickable hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
      onClick={onThreadClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <VoteButtons event={thread} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-lg leading-tight line-clamp-2">
                {title}
              </h3>
              {thread._relaySource && (
                <Badge variant="outline" className="text-xs shrink-0">
                  <Server className="w-3 h-3 mr-1" />
                  {formatRelayName(thread._relaySource)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                <topicInfo.icon className="w-3 h-3 mr-1" />
                {topicInfo.label}
              </Badge>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="text-sm text-muted-foreground leading-relaxed">
          {contentPreview}
        </div>
        
        <div className="flex items-center justify-between mt-3 pt-3 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <Username 
              userId={thread.pubkey} 
              className="truncate font-medium"
              skeletonClassName="h-4 w-20"
            />
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            {t('Read more')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
