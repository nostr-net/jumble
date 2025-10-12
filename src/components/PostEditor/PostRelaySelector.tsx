import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerOverlay } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ExtendedKind } from '@/constants'
import client from '@/services/client.service'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import { simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Check } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RelayIcon from '../RelayIcon'
import { extractMentions } from './Mentions'

export default function PostRelaySelector({
  parentEvent: _parentEvent,
  openFrom,
  setIsProtectedEvent,
  setAdditionalRelayUrls,
  content: postContent = ''
}: {
  parentEvent?: NostrEvent
  openFrom?: string[]
  setIsProtectedEvent: Dispatch<SetStateAction<boolean>>
  setAdditionalRelayUrls: Dispatch<SetStateAction<string[]>>
  content?: string
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const { relayUrls } = useCurrentRelays()
  const { relaySets, favoriteRelays } = useFavoriteRelays()
  const { pubkey } = useNostr()
  const [selectedRelayUrls, setSelectedRelayUrls] = useState<string[]>([])
  const [mentionRelays, setMentionRelays] = useState<string[]>([])
  
  // Fetch mention relays for regular replies (not discussion replies)
  const isRegularReply = useMemo(() => {
    if (!_parentEvent) return false
    // Kind 1 or Kind 1111 that is not a reply to Kind 11 (discussion)
    return (_parentEvent.kind === 1 || _parentEvent.kind === ExtendedKind.COMMENT) && 
           _parentEvent.kind !== ExtendedKind.DISCUSSION
  }, [_parentEvent])
  
  // Get all selectable relays (write relays + favorite relays + relays from relay sets + mention relays)
  const selectableRelays = useMemo(() => {
    const allRelays = Array.from(new Set([
      ...relayUrls,
      ...favoriteRelays,
      ...relaySets.flatMap(set => set.relayUrls),
      ...mentionRelays
    ]))
    return allRelays
  }, [relayUrls, favoriteRelays, relaySets, mentionRelays])
  
  const description = useMemo(() => {
    if (selectedRelayUrls.length === 0) {
      return t('No relays selected')
    }
    if (selectedRelayUrls.length === 1) {
      return simplifyUrl(selectedRelayUrls[0])
    }
    return t('{{count}} relays', { count: selectedRelayUrls.length })
  }, [selectedRelayUrls])

  // Fetch mention relays when content changes for regular replies
  useEffect(() => {
    if (!isRegularReply) {
      setMentionRelays([])
      return
    }

    const fetchMentionRelays = async () => {
      try {
        console.log('PostRelaySelector: extractMentions called with:', { postContent, parentEvent: _parentEvent?.id })
        const { pubkeys, relatedPubkeys } = await extractMentions(postContent, _parentEvent)
        console.log('PostRelaySelector: extractMentions returned:', { pubkeys, relatedPubkeys })
        
        // Combine all mentioned pubkeys and filter out current user's pubkey
        const allMentionPubkeys = [...pubkeys, ...relatedPubkeys]
        const filteredMentionPubkeys = allMentionPubkeys.filter(p => p !== pubkey)
        console.log('PostRelaySelector: filtered mention pubkeys:', filteredMentionPubkeys)
        
        if (filteredMentionPubkeys.length === 0) {
          setMentionRelays([])
          return
        }

        // Fetch relay lists for all mentioned users (including parent event author)
        console.log('PostRelaySelector: Fetching relays for pubkeys:', filteredMentionPubkeys)
        const relayListPromises = filteredMentionPubkeys.map(async (pubkey) => {
          try {
            const relayList = await client.fetchRelayList(pubkey)
            console.log(`PostRelaySelector: Fetched relays for ${pubkey}:`, relayList?.write || [])
            return relayList?.write || []
          } catch (error) {
            console.warn(`Failed to fetch relay list for ${pubkey}:`, error)
            return []
          }
        })

        const relayLists = await Promise.all(relayListPromises)
        const allMentionRelays = relayLists.flat()
        const uniqueMentionRelays = Array.from(new Set(allMentionRelays))
        
        console.log('PostRelaySelector: Setting mention relays:', uniqueMentionRelays)
        setMentionRelays(uniqueMentionRelays)
      } catch (error) {
        console.error('Error fetching mention relays:', error)
        setMentionRelays([])
      }
    }

    // Debounce the fetch
    const timeoutId = setTimeout(fetchMentionRelays, 300)
    return () => clearTimeout(timeoutId)
  }, [postContent, isRegularReply, _parentEvent])

  // Initialize selected relays based on context
  useEffect(() => {
    if (openFrom && openFrom.length) {
      // If called with specific relay URLs (e.g., from a discussion thread)
      setSelectedRelayUrls(Array.from(new Set(openFrom)))
      return
    }
    
    // Check if we're replying to a discussion or comment that requires specific relay routing
    if (_parentEvent && (_parentEvent.kind === ExtendedKind.DISCUSSION || _parentEvent.kind === ExtendedKind.COMMENT)) {
      let relayHint: string | undefined
      
      if (_parentEvent.kind === ExtendedKind.COMMENT) {
        // For kind 1111 (COMMENT): look for 'E' tag which points to the root event
        const ETag = _parentEvent.tags.find(tag => tag[0] === 'E')
        if (ETag && ETag[2]) {
          relayHint = ETag[2] // Relay hint is the 3rd element
        }
        
        // If no 'E' tag, check lowercase 'e' tag for parent event
        if (!relayHint) {
          const eTag = _parentEvent.tags.find(tag => tag[0] === 'e')
          if (eTag && eTag[2]) {
            relayHint = eTag[2]
          }
        }
      } else if (_parentEvent.kind === ExtendedKind.DISCUSSION) {
        // For kind 11 (DISCUSSION): get relay hint from where it was found
        const eventHints = client.getEventHints(_parentEvent.id)
        if (eventHints.length > 0) {
          relayHint = eventHints[0]
        }
      }
      
      // If we found a valid relay hint, use it instead of write relays
      if (relayHint && isWebsocketUrl(relayHint)) {
        const normalizedRelayHint = normalizeUrl(relayHint)
        if (normalizedRelayHint) {
          setSelectedRelayUrls([normalizedRelayHint])
          return
        }
      }
    }
    
    // Default to write relays + mention relays for regular replies, or just write relays for other cases
    if (isRegularReply) {
      // For regular replies, include write relays and mention relays
      const defaultRelays = Array.from(new Set([...relayUrls, ...mentionRelays]))
      console.log('PostRelaySelector: Setting default relays for regular reply:', {
        relayUrls,
        mentionRelays,
        defaultRelays,
        isRegularReply
      })
      setSelectedRelayUrls(defaultRelays)
    } else {
      // For other cases, just use write relays
      console.log('PostRelaySelector: Setting default relays for non-regular reply:', relayUrls)
      setSelectedRelayUrls(relayUrls)
    }
  }, [openFrom, _parentEvent, relayUrls, isRegularReply, mentionRelays])

  // Update parent component with selected relays
  useEffect(() => {
    const isProtectedEvent = selectedRelayUrls.length > 0 && !selectedRelayUrls.some(url => relayUrls.includes(url))
    setIsProtectedEvent(isProtectedEvent)
    setAdditionalRelayUrls(selectedRelayUrls)
  }, [selectedRelayUrls, relayUrls, setIsProtectedEvent, setAdditionalRelayUrls])

  const handleRelayCheckedChange = useCallback((checked: boolean, url: string) => {
    if (checked) {
      setSelectedRelayUrls(prev => [...prev, url])
    } else {
      setSelectedRelayUrls(prev => prev.filter(selectedUrl => selectedUrl !== url))
    }
  }, [])

  const content = useMemo(() => {
    if (selectableRelays.length === 0) {
      return (
        <div className="px-4 py-3 text-sm text-muted-foreground text-center">
          {t('No relays available')}
        </div>
      )
    }

    return (
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {selectableRelays.map((url) => (
          <MenuItem
            key={url}
            checked={selectedRelayUrls.includes(url)}
            onCheckedChange={(checked) => handleRelayCheckedChange(checked, url)}
          >
            <div className="flex items-center gap-2">
              <RelayIcon url={url} />
              <div className="truncate">{simplifyUrl(url)}</div>
            </div>
          </MenuItem>
        ))}
      </div>
    )
  }, [selectedRelayUrls, selectableRelays])

  if (isSmallScreen) {
    return (
      <>
        <div className="flex items-center gap-2">
          {t('Post to')}
          <Button
            variant="outline"
            className="px-2 flex-1 max-w-fit justify-start"
            onClick={() => setIsDrawerOpen(true)}
          >
            <div className="truncate">{description}</div>
          </Button>
        </div>
        <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
          <DrawerOverlay onClick={() => setIsDrawerOpen(false)} />
          <DrawerContent className="max-h-[80vh]" hideOverlay>
            <div
              className="overflow-y-auto overscroll-contain py-2"
              style={{ touchAction: 'pan-y' }}
            >
              {content}
            </div>
          </DrawerContent>
        </Drawer>
      </>
    )
  }

  return (
    <DropdownMenu>
      <div className="flex items-center gap-2">
        {t('Post to')}
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="px-2 flex-1 max-w-fit justify-start">
            <div className="truncate">{description}</div>
          </Button>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="start" className="max-w-96 max-h-[50vh]" showScrollButtons>
        {content}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}


function MenuItem({
  children,
  checked,
  onCheckedChange
}: {
  children: React.ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const { isSmallScreen } = useScreenSize()

  if (isSmallScreen) {
    return (
      <div
        onClick={() => onCheckedChange(!checked)}
        className="flex items-center gap-2 px-4 py-3 clickable"
      >
        <div className="flex items-center justify-center size-4 shrink-0">
          {checked && <Check className="size-4" />}
        </div>
        {children}
      </div>
    )
  }

  return (
    <div
      onClick={() => onCheckedChange(!checked)}
      className="flex items-center gap-2 px-2 py-2 hover:bg-muted cursor-pointer rounded-sm"
    >
      <div className="flex items-center justify-center size-4 shrink-0">
        {checked && <Check className="size-4" />}
      </div>
      {children}
    </div>
  )
}
