import { simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useScreenSize } from '@/providers/ScreenSizeProvider'
import { useNostr } from '@/providers/NostrProvider'
import { Check } from 'lucide-react'
import { NostrEvent } from 'nostr-tools'
import { Dispatch, SetStateAction, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import RelayIcon from '../RelayIcon'
import relaySelectionService from '@/services/relay-selection.service'

export default function PostRelaySelector({
  parentEvent: _parentEvent,
  openFrom,
  setIsProtectedEvent,
  setAdditionalRelayUrls,
  content: postContent = '',
  isPublicMessage = false
}: {
  parentEvent?: NostrEvent
  openFrom?: string[]
  setIsProtectedEvent: Dispatch<SetStateAction<boolean>>
  setAdditionalRelayUrls: Dispatch<SetStateAction<string[]>>
  content?: string
  isPublicMessage?: boolean
}) {
  const { t } = useTranslation()
  const { isSmallScreen } = useScreenSize()
  useCurrentRelays() // Keep this hook call for any side effects
  const { relaySets, favoriteRelays, blockedRelays } = useFavoriteRelays()
  const { pubkey, relayList } = useNostr()
  const [selectedRelayUrls, setSelectedRelayUrls] = useState<string[]>([])
  const [selectableRelays, setSelectableRelays] = useState<string[]>([])
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [hasManualSelection, setHasManualSelection] = useState(false)
  const [previousSelectableCount, setPreviousSelectableCount] = useState(0)

  // Use centralized relay selection service
  useEffect(() => {
    const updateRelaySelection = async () => {
      setIsLoading(true)
      try {
        const result = await relaySelectionService.selectRelays({
          userWriteRelays: relayList?.write || [],
          userReadRelays: relayList?.read || [],
          favoriteRelays,
          blockedRelays,
          relaySets,
          parentEvent: _parentEvent,
          isPublicMessage,
          content: postContent,
          userPubkey: pubkey || undefined,
          openFrom
        })

        const newSelectableCount = result.selectableRelays.length
        const selectableRelaysChanged = newSelectableCount !== previousSelectableCount
        
        setSelectableRelays(result.selectableRelays)
        setPreviousSelectableCount(newSelectableCount)
        
        // Only update selected relays if:
        // 1. User hasn't manually modified them, OR
        // 2. New mention relays were added (selectable count changed)
        if (!hasManualSelection || selectableRelaysChanged) {
          setSelectedRelayUrls(result.selectedRelays)
          setDescription(result.description)
          // Reset manual selection flag if mentions changed
          if (selectableRelaysChanged && hasManualSelection) {
            setHasManualSelection(false)
          }
        }
        
        console.log('PostRelaySelector: Updated relay selection:', result)
      } catch (error) {
        console.error('Failed to update relay selection:', error)
        setSelectableRelays([])
        if (!hasManualSelection) {
          setSelectedRelayUrls([])
          setDescription('No relays selected')
        }
      } finally {
        setIsLoading(false)
      }
    }

    updateRelaySelection()
  }, [openFrom, _parentEvent, favoriteRelays, blockedRelays, relaySets, isPublicMessage, postContent, pubkey, relayList])

  // Update description when selected relays change due to manual selection
  useEffect(() => {
    if (hasManualSelection && !isLoading) {
      const count = selectedRelayUrls.length
      setDescription(count === 0 ? 'No relays selected' : count === 1 ? simplifyUrl(selectedRelayUrls[0]) : `${count} relays`)
    }
  }, [selectedRelayUrls, hasManualSelection, isLoading])

  // Update parent component with selected relays
  useEffect(() => {
    // An event is "protected" if we have selected relays that aren't the default user write relays
    const userWriteRelays = relayList?.write || []
    const isProtectedEvent = selectedRelayUrls.length > 0 && !selectedRelayUrls.every(url => userWriteRelays.includes(url))
    setIsProtectedEvent(isProtectedEvent)
    setAdditionalRelayUrls(selectedRelayUrls)
  }, [selectedRelayUrls, relayList, setIsProtectedEvent, setAdditionalRelayUrls])

  const handleRelayCheckedChange = useCallback((checked: boolean, url: string) => {
    setHasManualSelection(true)
    if (checked) {
      setSelectedRelayUrls(prev => [...prev, url])
    } else {
      setSelectedRelayUrls(prev => prev.filter(u => u !== url))
    }
  }, [])

  const handleSelectAll = useCallback(() => {
    setHasManualSelection(true)
    setSelectedRelayUrls([...selectableRelays])
  }, [selectableRelays])

  const handleClearAll = useCallback(() => {
    setHasManualSelection(true)
    setSelectedRelayUrls([])
  }, [])

  const content = (
    <div className="space-y-2">
      {selectableRelays.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('Select All')}
          </button>
          <button
            onClick={handleClearAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('Clear All')}
          </button>
        </div>
      )}
      
      <div className="max-h-48 overflow-y-auto space-y-1">
        {isLoading ? (
          <div className="text-sm text-muted-foreground p-2">{t('Loading relays...')}</div>
        ) : selectableRelays.length === 0 ? (
          <div className="text-sm text-muted-foreground p-2">{t('No relays available')}</div>
        ) : (
          selectableRelays.map((url) => {
            const isChecked = selectedRelayUrls.includes(url)
            return (
              <div
                key={url}
                className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                onClick={() => handleRelayCheckedChange(!isChecked, url)}
              >
                <div className="flex items-center justify-center w-4 h-4 border border-border rounded">
                  {isChecked && <Check className="w-3 h-3" />}
                </div>
                <RelayIcon url={url} className="w-4 h-4" />
                <span className="text-sm flex-1 truncate">{simplifyUrl(url)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  if (isSmallScreen) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('Post to')}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
        
        {/* Drawer implementation would go here */}
        <div className="border border-border rounded p-2">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('Post to')}</span>
        <span className="text-sm text-muted-foreground">{description}</span>
      </div>
      
      <div className="border border-border rounded p-2">
        {content}
      </div>
    </div>
  )
}