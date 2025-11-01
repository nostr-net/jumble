import { getUsingClient } from '@/lib/event'
import { NostrEvent } from 'nostr-tools'
import { useMemo } from 'react'

export default function ClientTag({ event }: { event: NostrEvent }) {
  const usingClient = useMemo(() => getUsingClient(event), [event])

  if (!usingClient) return null

  return (
    <span className="text-xs text-muted-foreground/70 px-1.5">
      {usingClient}
    </span>
  )
}
