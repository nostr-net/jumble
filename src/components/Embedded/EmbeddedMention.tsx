import { cn } from '@/lib/utils'
import Username, { SimpleUsername } from '../Username'

export function EmbeddedMention({ userId, className }: { userId: string; className?: string }) {
  return (
    <Username
      userId={userId}
      showAt
      className={cn('text-primary font-normal inline', className)}
      style={{ verticalAlign: 'baseline' }}
      withoutSkeleton
    />
  )
}

export function EmbeddedMentionText({ userId, className }: { userId: string; className?: string }) {
  return (
    <SimpleUsername userId={userId} showAt className={cn('inline', className)} withoutSkeleton />
  )
}
