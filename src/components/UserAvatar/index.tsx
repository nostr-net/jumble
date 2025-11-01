import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetchProfile } from '@/hooks'
import { generateImageByPubkey } from '@/lib/pubkey'
import { toProfile } from '@/lib/link'
import { cn } from '@/lib/utils'
import { useSmartProfileNavigation } from '@/PageManager'
import { nip19 } from 'nostr-tools'
import { useMemo, useState, useEffect } from 'react'

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
      data-user-avatar
      className={cn('shrink-0 cursor-pointer', UserAvatarSizeCnMap[size], className)}
      onClick={(e) => {
        e.stopPropagation()
        navigateToProfile(toProfile(pubkey))
      }}
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
  // Always generate default avatar from userId/pubkey, even if profile isn't loaded yet
  const pubkey = useMemo(() => {
    if (!userId) return ''
    try {
      // Try to extract pubkey from userId (handles npub, nprofile, or hex pubkey)
      if (userId.length === 64 && /^[0-9a-f]+$/i.test(userId)) {
        return userId
      }
      // Try to decode npub/nprofile to get pubkey
      try {
        const decoded = nip19.decode(userId)
        if (decoded.type === 'npub') {
          return decoded.data
        } else if (decoded.type === 'nprofile') {
          return decoded.data.pubkey
        }
      } catch {
        // Not a valid npub/nprofile, continue
      }
      // Use profile pubkey if available
      if (profile?.pubkey) {
        return profile.pubkey
      }
      return ''
    } catch {
      return ''
    }
  }, [userId, profile?.pubkey])
  
  const defaultAvatar = useMemo(
    () => (pubkey ? generateImageByPubkey(pubkey) : ''),
    [pubkey]
  )

  // Use profile avatar if available, otherwise use default avatar
  const avatarSrc = profile?.avatar || defaultAvatar || ''
  
  // All hooks must be called before any early returns
  const [imgError, setImgError] = useState(false)
  const [currentSrc, setCurrentSrc] = useState(avatarSrc)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Reset error state when src changes
  useEffect(() => {
    setImgError(false)
    setImageLoaded(false)
    setCurrentSrc(avatarSrc)
  }, [avatarSrc])

  const handleImageError = () => {
    if (profile?.avatar && defaultAvatar && currentSrc === profile.avatar) {
      // Try default avatar if profile avatar fails
      setCurrentSrc(defaultAvatar)
      setImgError(false)
    } else {
      // Both failed, show placeholder
      setImgError(true)
      setImageLoaded(true)
    }
  }

  const handleImageLoad = () => {
    setImageLoaded(true)
    setImgError(false)
  }

  // If we have a pubkey (from decoding npub/nprofile or profile), show avatar even without profile
  // Otherwise show skeleton while loading
  if (!profile && !pubkey) {
    return (
      <Skeleton className={cn('shrink-0', UserAvatarSizeCnMap[size], 'rounded-full', className)} />
    )
  }

  // Use pubkey from decoded userId if profile isn't loaded yet
  const displayPubkey = profile?.pubkey || pubkey || ''
  
  // Render image directly instead of using Radix UI Avatar for better reliability
  return (
    <div 
      className={cn('shrink-0 relative overflow-hidden rounded-full bg-muted', UserAvatarSizeCnMap[size], className)}
    >
      {!imgError && currentSrc ? (
        <>
          {!imageLoaded && (
            <div className="absolute inset-0 bg-muted animate-pulse" />
          )}
          <img 
            src={currentSrc}
            alt={displayPubkey}
            className={cn(
              'h-full w-full object-cover object-center transition-opacity duration-200',
              imageLoaded ? 'opacity-100' : 'opacity-0'
            )}
            onError={handleImageError}
            onLoad={handleImageLoad}
            loading="lazy"
          />
        </>
      ) : (
        // Show initials or placeholder when image fails
        <div className="h-full w-full flex items-center justify-center text-xs font-medium text-muted-foreground">
          {displayPubkey ? displayPubkey.slice(0, 2).toUpperCase() : ''}
        </div>
      )}
    </div>
  )
}