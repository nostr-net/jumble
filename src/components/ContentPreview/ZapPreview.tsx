import { useFetchEvent } from '@/hooks'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { formatAmount } from '@/lib/lightning'
import { cn } from '@/lib/utils'
import { Zap } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import Username from '../Username'

export default function ZapPreview({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const zapInfo = useMemo(() => getZapInfoFromEvent(event), [event])
  const { event: targetEvent } = useFetchEvent(zapInfo?.eventId)

  if (!zapInfo || !zapInfo.senderPubkey || !zapInfo.amount) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        [{t('Invalid zap receipt')}]
      </div>
    )
  }

  const { senderPubkey, recipientPubkey, amount, comment } = zapInfo

  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-lg border bg-card', className)}>
      <Zap size={24} className="text-yellow-400 shrink-0 mt-0.5" fill="currentColor" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Username userId={senderPubkey} className="font-semibold" />
          <span className="text-muted-foreground text-sm">{t('zapped')}</span>
          {recipientPubkey && recipientPubkey !== senderPubkey && (
            <Username userId={recipientPubkey} className="font-semibold" />
          )}
        </div>
        <div className="font-bold text-yellow-400 mt-1">
          {formatAmount(amount)} {t('sats')}
        </div>
        {comment && (
          <div className="text-sm text-muted-foreground mt-2 break-words">
            {comment}
          </div>
        )}
        {targetEvent && (
          <div className="text-xs text-muted-foreground mt-2">
            {t('on note')} {targetEvent.id.substring(0, 8)}...
          </div>
        )}
      </div>
    </div>
  )
}

