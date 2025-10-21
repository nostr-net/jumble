import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, Clock, TrendingUp, ArrowUpDown, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type ReplySortOption = 'newest' | 'oldest' | 'top' | 'controversial' | 'most-zapped'

export default function ReplySort({ selectedSort, onSortChange }: { selectedSort: ReplySortOption; onSortChange: (sort: ReplySortOption) => void }) {
  const { t } = useTranslation()

  const sortOptions = [
    { id: 'newest' as ReplySortOption, label: t('Newest'), icon: Clock },
    { id: 'oldest' as ReplySortOption, label: t('Oldest'), icon: Clock },
    { id: 'top' as ReplySortOption, label: t('Top'), icon: TrendingUp },
    { id: 'controversial' as ReplySortOption, label: t('Controversial'), icon: ArrowUpDown },
    { id: 'most-zapped' as ReplySortOption, label: t('Most Zapped'), icon: Zap },
  ]

  const selectedOption = sortOptions.find(option => option.id === selectedSort) || sortOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-1 h-8 px-2">
          <selectedOption.icon className="w-4 h-4" />
          <span className="text-sm">{selectedOption.label}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {sortOptions.map(option => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => onSortChange(option.id)}
            className="flex items-center gap-2"
          >
            <option.icon className="w-4 h-4" />
            <span>{option.label}</span>
            {option.id === selectedSort && (
              <span className="ml-auto text-primary">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
