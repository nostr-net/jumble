import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks'
import { toProfile } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSmartProfileNavigation } from '@/PageManager'

export default function Username({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false,
  style
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
  style?: React.CSSProperties
}) {
  const { profile } = useFetchProfile(userId)
  const { navigateToProfile } = useSmartProfileNavigation()
  
  if (!profile && !withoutSkeleton) {
    return (
      <div className="py-1">
        <Skeleton className={cn('w-16', skeletonClassName)} />
      </div>
    )
  }

  if (!profile) {
    return null
  }

  const { username, pubkey } = profile

  return (
    <span 
      data-username
      className={cn('truncate hover:underline cursor-pointer', className)}
      style={{ verticalAlign: 'baseline', ...style }}
      onClick={(e) => {
        e.stopPropagation()
        navigateToProfile(toProfile(pubkey))
      }}
    >
      {showAt && '@'}
      {username}
    </span>
  )
}

export function SimpleUsername({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false,
  style
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
  style?: React.CSSProperties
}) {
  const { profile } = useFetchProfile(userId)
  
  if (!profile && !withoutSkeleton) {
    return (
      <div className="py-1">
        <Skeleton className={cn('w-16', skeletonClassName)} />
      </div>
    )
  }

  if (!profile) {
    return null
  }

  const { username } = profile

  return (
    <span 
      className={cn('truncate', className)}
      style={{ verticalAlign: 'baseline', ...style }}
    >
      {showAt && '@'}
      {username}
    </span>
  )
}