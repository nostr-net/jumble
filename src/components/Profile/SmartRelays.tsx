import { useFetchRelayList } from '@/hooks'
import { toOthersRelaySettings, toRelaySettings } from '@/lib/link'
import { useSmartSettingsNavigation } from '@/PageManager'
import { useNostr } from '@/providers/NostrProvider'
import { Loader } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SmartRelays({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation()
  const { pubkey: accountPubkey } = useNostr()
  const { relayList, isFetching } = useFetchRelayList(pubkey)
  const { navigateToSettings } = useSmartSettingsNavigation()

  const handleClick = () => {
    const url = accountPubkey === pubkey ? toRelaySettings('mailbox') : toOthersRelaySettings(pubkey)
    navigateToSettings(url)
  }

  return (
    <span
      className="flex gap-1 hover:underline w-fit items-center cursor-pointer"
      onClick={handleClick}
    >
      {isFetching ? <Loader className="animate-spin size-4" /> : relayList.originalRelays.length}
      <div className="text-muted-foreground">{t('Relays')}</div>
    </span>
  )
}
