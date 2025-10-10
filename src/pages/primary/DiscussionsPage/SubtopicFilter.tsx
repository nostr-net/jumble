import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SubtopicFilterProps {
  subtopics: string[]
  selectedSubtopic: string | null
  onSubtopicChange: (subtopic: string | null) => void
}

export default function SubtopicFilter({ 
  subtopics, 
  selectedSubtopic, 
  onSubtopicChange 
}: SubtopicFilterProps) {
  const { t } = useTranslation()

  if (subtopics.length === 0) return null

  const formatSubtopicLabel = (subtopic: string): string => {
    return subtopic
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return (
    <div className="flex gap-2 flex-wrap items-center">
      <span className="text-sm text-muted-foreground">{t('Filter by')}:</span>
      <Badge
        variant={selectedSubtopic === null ? 'default' : 'outline'}
        className="cursor-pointer"
        onClick={() => onSubtopicChange(null)}
      >
        {t('All')}
      </Badge>
      {subtopics.map(subtopic => (
        <Badge
          key={subtopic}
          variant={selectedSubtopic === subtopic ? 'default' : 'outline'}
          className="cursor-pointer flex items-center gap-1"
          onClick={() => onSubtopicChange(subtopic)}
        >
          {formatSubtopicLabel(subtopic)}
          {selectedSubtopic === subtopic && (
            <Button
              variant="ghost"
              size="icon"
              className="h-3 w-3 p-0 hover:bg-transparent"
              onClick={(e) => {
                e.stopPropagation()
                onSubtopicChange(null)
              }}
            >
              <X className="h-2 w-2" />
            </Button>
          )}
        </Badge>
      ))}
    </div>
  )
}

