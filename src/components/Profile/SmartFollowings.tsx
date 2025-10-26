import { useFetchFollowings } from '@/hooks'
import { toFollowingList } from '@/lib/link'
import { useSmartFollowingListNavigation } from '@/PageManager'
import { useFollowList } from '@/providers/FollowListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SmartFollowings({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { pubkey: accountPubkey } = useNostr()
  const { followings: selfFollowings } = useFollowList()
  const { followings, isFetching } = useFetchFollowings(pubkey)
  const { navigateToFollowingList } = useSmartFollowingListNavigation()

  const handleClick = () => {
    navigateToFollowingList(toFollowingList(pubkey))
  }

  return (
    <span
      className="flex gap-1 hover:underline w-fit items-center cursor-pointer"
      onClick={handleClick}
    >
      {accountPubkey === pubkey ? (
        selfFollowings.length
      ) : isFetching ? (
        <Loader className="animate-spin size-4" />
      ) : (
        followings.length
      )}
      <div className="text-muted-foreground">{t('Following')}</div>
    </span>
  )
}
