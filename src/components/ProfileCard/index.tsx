import { Button } from '@/components/ui/button'
import { useFetchProfile } from '@/hooks'
import { toProfile } from '@/lib/link'
import { useSmartProfileNavigation } from '@/PageManager'
import { UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import FollowButton from '../FollowButton'
import Nip05 from '../Nip05'
import ProfileAbout from '../ProfileAbout'
import { SimpleUserAvatar } from '../UserAvatar'

export default function ProfileCard({ pubkey }: { pubkey: string }) {
  const { profile } = useFetchProfile(pubkey)
  const { username, about } = profile || {}
  const { navigateToProfile } = useSmartProfileNavigation()
  const { t } = useTranslation()

  return (
    <div className="w-full flex flex-col gap-2 not-prose">
      <div className="flex space-x-2 w-full items-start justify-between">
        <SimpleUserAvatar userId={pubkey} className="w-12 h-12" />
        <FollowButton pubkey={pubkey} />
      </div>
      <div>
        <div className="text-lg font-semibold truncate">{username}</div>
        <Nip05 pubkey={pubkey} />
      </div>
      {about && (
        <ProfileAbout
          about={about}
          className="text-sm text-wrap break-words w-full overflow-hidden text-ellipsis line-clamp-6"
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full mt-2"
        onClick={(e) => {
          e.stopPropagation()
          navigateToProfile(toProfile(pubkey))
        }}
      >
        <UserRound className="w-4 h-4 mr-2" />
        {t('View full profile')}
      </Button>
    </div>
  )
}
