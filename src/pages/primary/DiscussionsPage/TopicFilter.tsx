import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { useMemo } from 'react'

interface Topic {
  id: string
  label: string
  icon: any
}

interface TopicFilterProps {
  topics: Topic[]
  selectedTopic: string
  onTopicChange: (topicId: string) => void
  threads: NostrEvent[]
  replies: NostrEvent[]
}

export default function TopicFilter({ topics, selectedTopic, onTopicChange, threads, replies }: TopicFilterProps) {
  // Sort topics by activity (most recent kind 11 or kind 1111 events first)
  const sortedTopics = useMemo(() => {
    const allEvents = [...threads, ...replies]
    
    return [...topics].sort((a, b) => {
      // Find the most recent event for each topic
      const getMostRecentEvent = (topicId: string) => {
        return allEvents
          .filter(event => {
            const topicTag = event.tags.find(tag => tag[0] === 't' && tag[1] === topicId)
            return topicTag !== undefined
          })
          .sort((a, b) => b.created_at - a.created_at)[0]
      }
      
      const mostRecentA = getMostRecentEvent(a.id)
      const mostRecentB = getMostRecentEvent(b.id)
      
      // If one has events and the other doesn't, prioritize the one with events
      if (mostRecentA && !mostRecentB) return -1
      if (!mostRecentA && mostRecentB) return 1
      if (!mostRecentA && !mostRecentB) return 0 // Both have no events, keep original order
      
      // Sort by creation time (most recent first)
      return mostRecentB!.created_at - mostRecentA!.created_at
    })
  }, [topics, threads, replies])
  
  const selectedTopicInfo = sortedTopics.find(topic => topic.id === selectedTopic) || sortedTopics[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 h-10 px-3 min-w-44"
        >
          <selectedTopicInfo.icon className="w-4 h-4" />
          <span className="flex-1 text-left">{selectedTopicInfo.id}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {sortedTopics.map(topic => (
          <DropdownMenuItem
            key={topic.id}
            onClick={() => onTopicChange(topic.id)}
            className="flex items-center gap-2"
          >
            <topic.icon className="w-4 h-4" />
            <span>{topic.label}</span>
            {topic.id === selectedTopic && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
