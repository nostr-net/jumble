import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks'
import { generateImageByPubkey } from '@/lib/pubkey'
import { toProfile } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSmartProfileNavigation } from '@/PageManager'
import { useMemo } from 'react'

const UserAvatarSizeCnMap = {
  large: 'w-24 h-24',
  big: 'w-16 h-16',
  semiBig: 'w-12 h-12',
  normal: 'w-10 h-10',
  medium: 'w-9 h-9',
  small: 'w-7 h-7',
  xSmall: 'w-5 h-5',
  tiny: 'w-4 h-4'
}

export default function UserAvatar({
  userId,
  className,
  size = 'normal'
}: {
  userId: string
  className?: string
  size?: 'large' | 'big' | 'semiBig' | 'normal' | 'medium' | 'small' | 'xSmall' | 'tiny'
}) {
  const { profile } = useFetchProfile(userId)
  const { navigateToProfile } = useSmartProfileNavigation()
  const defaultAvatar = useMemo(
    () => (profile?.pubkey ? generateImageByPubkey(profile.pubkey) : ''),
    [profile]
  )

  if (!profile) {
    return (
      <Skeleton className={cn('shrink-0', UserAvatarSizeCnMap[size], 'rounded-full', className)} />
    )
  }

  const { avatar, pubkey } = profile

  return (
    <Avatar 
      className={cn('shrink-0 cursor-pointer', UserAvatarSizeCnMap[size], className)}
      onClick={() => navigateToProfile(toProfile(pubkey))}
    >
      <AvatarImage src={avatar} className="object-cover object-center" />
      <AvatarFallback>
        <img src={defaultAvatar} alt={pubkey} />
      </AvatarFallback>
    </Avatar>
  )
}

export function SimpleUserAvatar({
  userId,
  size = 'normal',
  className
}: {
  userId: string
  size?: 'large' | 'big' | 'semiBig' | 'normal' | 'medium' | 'small' | 'xSmall' | 'tiny'
  className?: string
}) {
  const { profile } = useFetchProfile(userId)
  const defaultAvatar = useMemo(
    () => (profile?.pubkey ? generateImageByPubkey(profile.pubkey) : ''),
    [profile]
  )

  if (!profile) {
    return (
      <Skeleton className={cn('shrink-0', UserAvatarSizeCnMap[size], 'rounded-full', className)} />
    )
  }

  const { avatar, pubkey } = profile

  return (
    <Avatar className={cn('shrink-0', UserAvatarSizeCnMap[size], className)}>
      <AvatarImage src={avatar} className="object-cover object-center" />
      <AvatarFallback>
        <img src={defaultAvatar} alt={pubkey} />
      </AvatarFallback>
    </Avatar>
  )
}