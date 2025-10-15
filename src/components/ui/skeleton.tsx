import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <span className={cn('animate-pulse rounded-md bg-primary/10 inline-block', className)} {...props} />
}

export { Skeleton }
