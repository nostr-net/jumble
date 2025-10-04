import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, User, Clock, Hash } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { formatDistanceToNow } from 'date-fns'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { truncateText } from '@/lib/utils'

interface ThreadCardProps {
  thread: NostrEvent
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

  // Get topic display info
  const getTopicInfo = (topicId: string) => {
    const topicMap: Record<string, { label: string; color: string }> = {
      general: { label: 'General', color: 'bg-gray-100 text-gray-800' },
      meetups: { label: 'Meetups', color: 'bg-blue-100 text-blue-800' },
      devs: { label: 'Developers', color: 'bg-green-100 text-green-800' },
      finance: { label: 'Finance', color: 'bg-yellow-100 text-yellow-800' },
      politics: { label: 'Politics', color: 'bg-red-100 text-red-800' },
      literature: { label: 'Literature', color: 'bg-purple-100 text-purple-800' },
      philosophy: { label: 'Philosophy', color: 'bg-indigo-100 text-indigo-800' },
      tech: { label: 'Technology', color: 'bg-cyan-100 text-cyan-800' },
      sports: { label: 'Sports', color: 'bg-orange-100 text-orange-800' }
    }
    return topicMap[topicId] || { label: topicId, color: 'bg-gray-100 text-gray-800' }
  }

  const topicInfo = getTopicInfo(topic)

  return (
    <Card 
      className={cn(
        'clickable hover:shadow-md transition-shadow cursor-pointer',
        className
      )}
      onClick={onThreadClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg leading-tight mb-2 line-clamp-2">
              {title}
            </h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="secondary" className={cn('text-xs', topicInfo.color)}>
                <Hash className="w-3 h-3 mr-1" />
                {topicInfo.label}
              </Badge>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeAgo}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-sm text-muted-foreground shrink-0">
            <MessageCircle className="w-4 h-4" />
            <span>0</span> {/* TODO: Add reply count */}
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
            <span className="truncate">
              {thread.pubkey.slice(0, 8)}...{thread.pubkey.slice(-8)}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-8 px-2">
            {t('Read more')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
