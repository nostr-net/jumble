import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Hash, ChevronDown } from 'lucide-react'

interface Topic {
  id: string
  label: string
  icon: any
}

interface TopicFilterProps {
  topics: Topic[]
  selectedTopic: string
  onTopicChange: (topicId: string) => void
}

export default function TopicFilter({ topics, selectedTopic, onTopicChange }: TopicFilterProps) {
  const selectedTopicInfo = topics.find(topic => topic.id === selectedTopic) || topics[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 h-10 px-3"
        >
          <Hash className="w-4 h-4" />
          <span className="hidden sm:inline">{selectedTopicInfo.label}</span>
          <span className="sm:hidden">{selectedTopicInfo.label.slice(0, 8)}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {topics.map(topic => (
          <DropdownMenuItem
            key={topic.id}
            onClick={() => onTopicChange(topic.id)}
            className="flex items-center gap-2"
          >
            <Hash className="w-4 h-4" />
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
