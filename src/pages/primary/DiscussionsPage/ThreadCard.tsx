import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, Hash, Server } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { DISCUSSION_TOPICS } from './CreateThreadDialog'
import Username from '@/components/Username'
import UserAvatar from '@/components/UserAvatar'
import VoteButtons from '@/components/NoteStats/VoteButtons'
import { useScreenSize } from '@/providers/ScreenSizeProvider'

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
  const { isSmallScreen } = useScreenSize()

  // Extract title from tags
  const titleTag = thread.tags.find(tag => tag[0] === 'title' && tag[1])
  const title = titleTag?.[1] || t('Untitled')

  // Extract topic from tags
  const topicTag = thread.tags.find(tag => tag[0] === 't' && tag[1])
  const topic = topicTag?.[1] || 'general'
  
  // Extract author and subject for readings threads
  const authorTag = thread.tags.find(tag => tag[0] === 'author' && tag[1])
  const subjectTag = thread.tags.find(tag => tag[0] === 'subject' && tag[1])
  const isReadingGroup = thread.tags.find(tag => tag[0] === 't' && tag[1] === 'readings')

  // Get first 250 characters of content
  const contentPreview = thread.content.length > 250 
    ? thread.content.substring(0, 250) + '...'
    : thread.content

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
        {isSmallScreen ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <VoteButtons event={thread} />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg leading-tight line-clamp-2 mb-2 break-words">
                  {title}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <topicInfo.icon className="w-4 h-4" />
                    <span className="text-xs">{topicInfo.id}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <UserAvatar userId={thread.pubkey} size="xSmall" />
                  <Username 
                    userId={thread.pubkey} 
                    className="truncate font-medium"
                    skeletonClassName="h-4 w-20"
                  />
                </div>
                {thread._relaySource && (
                  <Badge variant="outline" className="text-xs">
                    <Server className="w-3 h-3 mr-1" />
                    {formatRelayName(thread._relaySource)}
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>{timeAgo}</span>
                </div>
                {isReadingGroup && (authorTag || subjectTag) && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4">
                    {authorTag && (
                      <span><strong>Author:</strong> {authorTag[1]}</span>
                    )}
                    {subjectTag && (
                      <span><strong>Book:</strong> {subjectTag[1]}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <VoteButtons event={thread} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="font-semibold text-lg leading-tight line-clamp-2 break-words">
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
                {isReadingGroup && (authorTag || subjectTag) && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 mt-2">
                    {authorTag && (
                      <span><strong>Author:</strong> {authorTag[1]}</span>
                    )}
                    {subjectTag && (
                      <span><strong>Book:</strong> {subjectTag[1]}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
              <UserAvatar userId={thread.pubkey} size="xSmall" />
              <Username 
                userId={thread.pubkey} 
                className="truncate font-medium"
                skeletonClassName="h-4 w-20"
              />
            </div>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        <div className="text-sm text-muted-foreground leading-relaxed break-words overflow-hidden">
          {contentPreview}
        </div>
      </CardContent>
    </Card>
  )
}
