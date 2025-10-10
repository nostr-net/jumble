import { useFetchEvent } from '@/hooks'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { formatAmount } from '@/lib/lightning'
import { toNote, toProfile } from '@/lib/link'
import { cn } from '@/lib/utils'
import { Zap as ZapIcon } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSecondaryPage } from '@/PageManager'
import Username from '../Username'
import UserAvatar from '../UserAvatar'

export default function Zap({ event, className }: { event: Event; className?: string }) {
  const { t } = useTranslation()
  const { push } = useSecondaryPage()
  const zapInfo = useMemo(() => getZapInfoFromEvent(event), [event])
  const { event: targetEvent } = useFetchEvent(zapInfo?.eventId)

  if (!zapInfo || !zapInfo.senderPubkey || !zapInfo.amount) {
    return (
      <div className={cn('text-sm text-muted-foreground p-4 border rounded-lg', className)}>
        [{t('Invalid zap receipt')}]
      </div>
    )
  }

  const { senderPubkey, recipientPubkey, amount, comment } = zapInfo

  return (
    <div className={cn('relative border rounded-lg p-4 bg-gradient-to-br from-yellow-50/50 to-amber-50/50 dark:from-yellow-950/20 dark:to-amber-950/20', className)}>
      {/* Zapped note/profile link in top-right corner */}
      {(targetEvent || recipientPubkey) && (
        <button
          onClick={() => {
            if (targetEvent) {
              push(toNote(targetEvent.id))
            } else if (recipientPubkey) {
              push(toProfile(recipientPubkey))
            }
          }}
          className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {targetEvent ? t('Zapped note') : t('Zapped profile')}
        </button>
      )}
      
      <div className="flex items-start gap-3">
        <ZapIcon size={28} className="text-yellow-500 shrink-0 mt-1" fill="currentColor" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <UserAvatar userId={senderPubkey} size="small" />
            <Username userId={senderPubkey} className="font-semibold" />
            <span className="text-muted-foreground text-sm">{t('zapped')}</span>
            {recipientPubkey && recipientPubkey !== senderPubkey && (
              <>
                <UserAvatar userId={recipientPubkey} size="small" />
                <Username userId={recipientPubkey} className="font-semibold" />
              </>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
              {formatAmount(amount)}
            </span>
            <span className="text-lg font-semibold text-yellow-600/70 dark:text-yellow-400/70">
              {t('sats')}
            </span>
          </div>
          {comment && (
            <div className="mt-3 text-sm bg-white/50 dark:bg-black/20 rounded-lg p-3 break-words">
              {comment}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

