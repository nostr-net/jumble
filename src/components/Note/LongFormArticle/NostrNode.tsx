import { EmbeddedMention, EmbeddedNote } from '@/components/Embedded'
import { nip19 } from 'nostr-tools'
import { useMemo } from 'react'
import logger from '@/lib/logger'

interface NostrNodeProps {
  rawText: string
  bech32Id?: string
}

export default function NostrNode({ rawText, bech32Id }: NostrNodeProps) {
  const { type, id } = useMemo(() => {
    if (!bech32Id) return { type: 'invalid', id: '' }
    try {
      const decoded = nip19.decode(bech32Id)
      if (decoded.type === 'npub' || decoded.type === 'nprofile') {
        return { type: 'mention', id: bech32Id }
      }
      if (decoded.type === 'nevent' || decoded.type === 'naddr' || decoded.type === 'note') {
        return { type: 'note', id: bech32Id }
      }
    } catch (error) {
      logger.error('Invalid bech32 ID', { bech32Id, error })
    }
    return { type: 'invalid', id: '' }
  }, [bech32Id])

  if (type === 'invalid') return rawText

  if (type === 'mention') {
    return <EmbeddedMention userId={id} className="not-prose" />
  }
  return <EmbeddedNote noteId={id} className="not-prose" />
}
