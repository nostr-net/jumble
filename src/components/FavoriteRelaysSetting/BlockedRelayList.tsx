import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useTranslation } from 'react-i18next'
import BlockedRelayItem from './BlockedRelayItem'

export default function BlockedRelayList() {
  const { t } = useTranslation()
  const { blockedRelays } = useFavoriteRelays()

  if (blockedRelays.length === 0) {
    return null
  }

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground font-semibold select-none">{t('Blocked Relays')}</div>
      <div className="grid gap-2">
        {blockedRelays.map((relay) => (
          <BlockedRelayItem key={relay} relay={relay} />
        ))}
      </div>
    </div>
  )
}

