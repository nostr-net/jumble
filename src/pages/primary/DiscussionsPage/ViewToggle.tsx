import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, List, Grid3X3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ViewToggleProps {
  viewMode: 'flat' | 'grouped'
  onViewModeChange: (mode: 'flat' | 'grouped') => void
  disabled?: boolean
}

export default function ViewToggle({ viewMode, onViewModeChange, disabled = false }: ViewToggleProps) {
  const { t } = useTranslation()

  const viewOptions = [
    { 
      id: 'flat' as const, 
      label: t('Flat View'), 
      icon: List,
      description: t('Show all discussions in a single list')
    },
    { 
      id: 'grouped' as const, 
      label: t('Grouped View'), 
      icon: Grid3X3,
      description: t('Group discussions by topic')
    }
  ]

  const selectedOption = viewOptions.find(option => option.id === viewMode) || viewOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className="flex items-center gap-2 h-10 px-3 min-w-32"
          disabled={disabled}
        >
          <selectedOption.icon className="w-4 h-4" />
          <span className="flex-1 text-left">{selectedOption.label}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {viewOptions.map(option => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => onViewModeChange(option.id)}
            className="flex items-start gap-3 p-3"
          >
            <option.icon className="w-4 h-4 mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">{option.label}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {option.description}
              </div>
            </div>
            {option.id === viewMode && (
              <span className="text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
