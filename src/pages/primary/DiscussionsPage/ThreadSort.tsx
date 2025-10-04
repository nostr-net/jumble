import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ChevronDown, Clock, TrendingUp, ArrowUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type SortOption = 'newest' | 'oldest' | 'top' | 'controversial'

export default function ThreadSort({ selectedSort, onSortChange }: { selectedSort: SortOption; onSortChange: (sort: SortOption) => void }) {
  const { t } = useTranslation()

  const sortOptions = [
    { id: 'newest' as SortOption, label: t('Newest'), icon: Clock },
    { id: 'oldest' as SortOption, label: t('Oldest'), icon: Clock },
    { id: 'top' as SortOption, label: t('Top'), icon: TrendingUp },
    { id: 'controversial' as SortOption, label: t('Controversial'), icon: ArrowUpDown },
  ]

  const selectedOption = sortOptions.find(option => option.id === selectedSort) || sortOptions[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 h-8">
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
