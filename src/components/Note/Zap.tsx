import { useFetchEvent } from '@/hooks'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { shouldHideInteractions } from '@/lib/event-filtering'
import { formatAmount } from '@/lib/lightning'
import { toNote, toProfile } from '@/lib/link'
import { cn } from '@/lib/utils'
import { Zap as ZapIcon } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSmartNoteNavigation, useSecondaryPage } from '@/PageManager'
import Username from '../Username'
import UserAvatar from '../UserAvatar'

export default function Zap({ event, className }: { event: Event; className?: string }) {
  // In quiet mode, we need to check the target event (if this is a zap receipt for an event)
  // For profile zaps, we can't check quiet mode since we don't have an event
  const zapInfo = useMemo(() => getZapInfoFromEvent(event), [event])
  const { event: targetEvent } = useFetchEvent(zapInfo?.eventId)
  
  // Check if the target event (if any) is in quiet mode
  const inQuietMode = targetEvent ? shouldHideInteractions(targetEvent) : false
  
  // Hide zap receipts in quiet mode as they contain emojis and text
  if (inQuietMode) {
    return null
  }
  const { t } = useTranslation()
  const { navigateToNote } = useSmartNoteNavigation()
  const { push } = useSecondaryPage()

  if (!zapInfo || !zapInfo.senderPubkey || !zapInfo.amount) {
    return (
      <div className={cn('text-sm text-muted-foreground p-4 border rounded-lg', className)}>
        [{t('Invalid zap receipt')}]
      </div>
    )
  }

  // Determine if this is an event zap or profile zap
  const isEventZap = targetEvent || zapInfo?.eventId
  const isProfileZap = !isEventZap && zapInfo?.recipientPubkey
  
  // For event zaps, we need to determine the recipient from the zapped event
  const actualRecipientPubkey = useMemo(() => {
    if (isEventZap && targetEvent) {
      // Event zap - recipient is the author of the zapped event
      return targetEvent.pubkey
    } else if (isProfileZap) {
      // Profile zap - recipient is directly specified
      return zapInfo?.recipientPubkey
    }
    return undefined
  }, [isEventZap, isProfileZap, targetEvent, zapInfo?.recipientPubkey])

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
      {/* Zapped note/profile link in bottom-right corner */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (isEventZap) {
            // Event zap - navigate to the zapped event
            if (targetEvent) {
              navigateToNote(toNote(targetEvent.id))
            } else if (zapInfo.eventId) {
              navigateToNote(toNote(zapInfo.eventId))
            }
          } else if (isProfileZap && actualRecipientPubkey) {
            // Profile zap - navigate to the zapped profile
            push(toProfile(actualRecipientPubkey))
          }
        }}
        className="absolute bottom-2 right-2 px-3 py-2 bg-white/90 dark:bg-black/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-black hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-900 dark:hover:text-gray-100 transition-all duration-200 shadow-md hover:shadow-lg flex items-center gap-2"
      >
        {isEventZap ? (
          <span className="font-mono text-xs">{(targetEvent?.id || zapInfo.eventId)?.substring(0, 12)}...</span>
        ) : isProfileZap && actualRecipientPubkey ? (
          <>
            <UserAvatar userId={actualRecipientPubkey} size="xSmall" />
            <span>{t('Zapped profile')}</span>
          </>
        ) : (
          t('Zap')
        )}
      </button>
      
      <div className="flex items-start gap-3 pb-8">
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

