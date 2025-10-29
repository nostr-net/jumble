import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RetroRefreshButtonProps {
  onClick: () => void
  isLoading?: boolean
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function RetroRefreshButton({ 
  onClick, 
  isLoading = false, 
  className,
  size = 'md'
}: RetroRefreshButtonProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 p-1',
    md: 'h-10 w-10 p-2',
    lg: 'h-12 w-12 p-3'
  }

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6'
  }

  return (
    <Button
      onClick={onClick}
      disabled={isLoading}
      className={cn(
        'bg-background text-foreground border-2 border-green-500 hover:bg-muted hover:border-green-400',
        'dark:bg-background dark:text-foreground dark:border-green-500 dark:hover:bg-muted dark:hover:border-green-400',
        'transition-all duration-200 ease-in-out',
        'shadow-lg hover:shadow-xl',
        'rounded-lg',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        sizeClasses[size],
        className
      )}
      variant="outline"
    >
      <RefreshCw 
        className={cn(
          'text-green-500 transition-transform duration-200',
          isLoading && 'animate-spin',
          iconSizes[size]
        )} 
      />
    </Button>
  )
}
