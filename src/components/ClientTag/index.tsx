import { getUsingClient } from '@/lib/event'
import { NostrEvent } from 'nostr-tools'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'

export default function ClientTag({ event }: { event: NostrEvent }) {
  const usingClient = useMemo(() => getUsingClient(event), [event])

  if (!usingClient) return null

  return (
    <Badge variant="outline" className="text-xs px-2 py-1 h-auto">
      {usingClient}
    </Badge>
  )
}
