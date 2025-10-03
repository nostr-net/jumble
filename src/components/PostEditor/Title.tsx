import { ExtendedKind } from '@/constants'
import { Event } from 'nostr-tools'
import { useTranslation } from 'react-i18next'

export default function Title({ 
  parentEvent, 
  isPoll = false, 
  isPublicMessage = false 
}: { 
  parentEvent?: Event
  isPoll?: boolean
  isPublicMessage?: boolean
}) {
  const { t } = useTranslation()

  if (parentEvent) {
    return (
      <div className="flex gap-2 items-center w-full">
        <div className="shrink-0">
          {parentEvent.kind === ExtendedKind.PUBLIC_MESSAGE 
            ? t('Reply to Public Message')
            : t('Reply to')
          }
        </div>
      </div>
    )
  }

  if (isPoll) {
    return t('New Poll')
  }

  if (isPublicMessage) {
    return t('New Public Message')
  }

  return t('New Note')
}
