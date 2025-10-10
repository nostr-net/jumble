import { Button } from '@/components/ui/button'
import { createRelayListDraftEvent } from '@/lib/draft-event'
import { showPublishingFeedback, showSimplePublishSuccess } from '@/lib/publishing-feedback'
import { useNostr } from '@/providers/NostrProvider'
import { TMailboxRelay } from '@/types'
import { CloudUpload, Loader } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function SaveButton({
  mailboxRelays,
  hasChange,
  setHasChange
}: {
  mailboxRelays: TMailboxRelay[]
  hasChange: boolean
  setHasChange: (hasChange: boolean) => void
}) {
  const { t } = useTranslation()
  const { pubkey, publish, updateRelayListEvent } = useNostr()
  const [pushing, setPushing] = useState(false)

  const save = async () => {
    if (!pubkey) return

    setPushing(true)
    try {
      const event = createRelayListDraftEvent(mailboxRelays)
      const result = await publish(event)
      await updateRelayListEvent(result)
      setHasChange(false)
      
      // Show publishing feedback
      if ((result as any).relayStatuses) {
        showPublishingFeedback({
          success: true,
          relayStatuses: (result as any).relayStatuses,
          successCount: (result as any).relayStatuses.filter((s: any) => s.success).length,
          totalCount: (result as any).relayStatuses.length
        }, {
          message: t('Mailbox relays saved'),
          duration: 6000
        })
      } else {
        showSimplePublishSuccess(t('Mailbox relays saved'))
      }
    } finally {
      setPushing(false)
    }
  }

  return (
    <Button className="w-full" disabled={!pubkey || pushing || !hasChange} onClick={save}>
      {pushing ? <Loader className="animate-spin" /> : <CloudUpload />}
      Save
    </Button>
  )
}
