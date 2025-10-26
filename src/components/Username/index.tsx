import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks'
import { cn } from '@/lib/utils'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useState } from 'react'
import ProfileCard from '../ProfileCard'

export default function Username({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
}) {
  const { profile } = useFetchProfile(userId)
  const { isSmallScreen } = useScreenSize()
  const [drawerOpen, setDrawerOpen] = useState(false)
  
  if (!profile && !withoutSkeleton) {
    return (
      <div className="py-1">
        <Skeleton className={cn('w-16', skeletonClassName)} />
      </div>
    )
  }
  if (!profile) return null

  const { username, pubkey } = profile

  if (isSmallScreen) {
    return (
      <>
        <div 
          className={cn('truncate hover:underline cursor-pointer', className)}
          onClick={() => setDrawerOpen(true)}
        >
          {showAt && '@'}
          {username}
        </div>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerOverlay onClick={() => setDrawerOpen(false)} />
          <DrawerContent hideOverlay className="max-h-[90vh]">
            <div className="overflow-y-auto overscroll-contain p-4" style={{ touchAction: 'pan-y' }}>
              <ProfileCard pubkey={pubkey} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className={cn('truncate hover:underline cursor-pointer', className)}>
          {showAt && '@'}
          {username}
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <ProfileCard pubkey={pubkey} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function SimpleUsername({
  userId,
  showAt = false,
  className,
  skeletonClassName,
  withoutSkeleton = false
}: {
  userId: string
  showAt?: boolean
  className?: string
  skeletonClassName?: string
  withoutSkeleton?: boolean
}) {
  const { profile } = useFetchProfile(userId)
  if (!profile && !withoutSkeleton) {
    return (
      <div className="py-1">
        <Skeleton className={cn('w-16', skeletonClassName)} />
      </div>
    )
  }
  if (!profile) return null

  const { username } = profile

  return (
    <div className={className}>
      {showAt && '@'}
      {username}
    </div>
  )
}
