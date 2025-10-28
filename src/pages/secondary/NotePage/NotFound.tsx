import ClientSelect from '@/components/ClientSelect'
import { Button } from '@/components/ui/button'
import { normalizeUrl } from '@/lib/url'
import client from '@/services/client.service'
import { AlertCircle, Search } from 'lucide-react'
import { nip19 } from 'nostr-tools'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function NotFound({ 
  bech32Id, 
  onEventFound 
}: { 
  bech32Id?: string
  onEventFound?: (event: any) => void 
}) {
  const { t } = useTranslation()
  const [isSearchingExternal, setIsSearchingExternal] = useState(false)
  const [triedExternal, setTriedExternal] = useState(false)
  const [externalRelays, setExternalRelays] = useState<string[]>([])

  // Calculate which external relays would be tried (excluding already-tried relays)
  useEffect(() => {
    if (!bech32Id) return

    const getExternalRelays = async () => {
      // Get all relays that would be tried in tiers 1-3 (already tried)
      const alreadyTriedRelays: string[] = await client.getAlreadyTriedRelays()
      
      let externalRelays: string[] = []
      
      // Parse relay hints and author from bech32 ID
      if (!/^[0-9a-f]{64}$/.test(bech32Id)) {
        try {
          const { type, data } = nip19.decode(bech32Id)
          
          if (type === 'nevent') {
            if (data.relays) externalRelays.push(...data.relays)
            if (data.author) {
              const authorRelayList = await client.fetchRelayList(data.author)
              externalRelays.push(...authorRelayList.write.slice(0, 6))
            }
          } else if (type === 'naddr') {
            if (data.relays) externalRelays.push(...data.relays)
            const authorRelayList = await client.fetchRelayList(data.pubkey)
            externalRelays.push(...authorRelayList.write.slice(0, 6))
          }
          // Normalize and deduplicate external relays
          externalRelays = externalRelays.map(url => normalizeUrl(url) || url)
          externalRelays = Array.from(new Set(externalRelays))
        } catch (err) {
          console.error('Failed to parse external relays:', err)
        }
      }
      
      const seenOn = client.getSeenEventRelayUrls(bech32Id)
      externalRelays.push(...seenOn)
      
      // Filter out relays that were already tried in tiers 1-3
      const newRelays = externalRelays.filter(relay => !alreadyTriedRelays.includes(relay))
      
      // Normalize and deduplicate final relay list
      const normalizedRelays = newRelays.map(url => normalizeUrl(url) || url)
      setExternalRelays(Array.from(new Set(normalizedRelays)))
    }

    getExternalRelays()
  }, [bech32Id])

  const handleTryExternalRelays = async () => {
    if (!bech32Id || isSearchingExternal) return
    
    setIsSearchingExternal(true)
    try {
      const event = await client.fetchEventWithExternalRelays(bech32Id, externalRelays)
      if (event && onEventFound) {
        onEventFound(event)
      }
    } catch (error) {
      console.error('External relay fetch failed:', error)
    } finally {
      setIsSearchingExternal(false)
      setTriedExternal(true)
    }
  }

  const hasExternalRelays = externalRelays.length > 0

  return (
    <div className="text-muted-foreground w-full h-full flex flex-col items-center justify-center gap-4 p-4">
      <AlertCircle className="w-12 h-12 text-muted-foreground/50" />
      <div className="text-lg font-medium">{t('Note not found')}</div>
      
      {bech32Id && !triedExternal && hasExternalRelays && (
        <div className="flex flex-col items-center gap-3 max-w-md">
          <p className="text-sm text-center text-muted-foreground">
            {t('The note was not found on your relays or default relays.')}
          </p>
          
          <Button
            variant="default"
            onClick={handleTryExternalRelays}
            disabled={isSearchingExternal}
            className="gap-2"
          >
            {isSearchingExternal ? (
              <>
                <Search className="w-4 h-4 animate-spin" />
                {t('Searching external relays...')}
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                {t('Try external relays')}
              </>
            )}
          </Button>
          
          <details className="text-xs text-muted-foreground w-full">
            <summary className="cursor-pointer hover:text-foreground text-center list-none">
              {t('Show relays')} ({externalRelays.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
              {externalRelays.map((relay, i) => (
                <div key={i} className="font-mono text-[10px] truncate px-2 py-1 bg-muted/50 rounded">
                  {relay}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}
      
      {bech32Id && !triedExternal && !hasExternalRelays && (
        <p className="text-sm text-muted-foreground">
          {t('No external relay hints available')}
        </p>
      )}
      
      {triedExternal && (
        <p className="text-sm">{t('Note could not be found anywhere')}</p>
      )}
      
      <ClientSelect originalNoteId={bech32Id} />
    </div>
  )
}
