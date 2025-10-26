import { toMuteList } from '@/lib/link'
import { useSmartSettingsNavigation } from '@/PageManager'
import { useMuteList } from '@/providers/MuteListProvider'
import { useTranslation } from 'react-i18next'

export default function SmartMuteLink() {
  const { t } = useTranslation()
  const { mutePubkeySet } = useMuteList()
  const { navigateToSettings } = useSmartSettingsNavigation()

  const handleClick = () => {
    navigateToSettings(toMuteList())
  }

  return (
    <span
      className="flex gap-1 hover:underline w-fit cursor-pointer"
      onClick={handleClick}
    >
      {mutePubkeySet.size}
      <div className="text-muted-foreground">{t('Muted')}</div>
    </span>
  )
}
