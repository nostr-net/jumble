import { ExtendedKind } from '@/constants'
import { getNoteBech32Id, isProtectedEvent, getRootEventHexId } from '@/lib/event'
import { toNjump } from '@/lib/link'
import { pubkeyToNpub } from '@/lib/pubkey'
import { normalizeUrl, simplifyUrl } from '@/lib/url'
import { useCurrentRelays } from '@/providers/CurrentRelaysProvider'
import { useFavoriteRelays } from '@/providers/FavoriteRelaysProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { BIG_RELAY_URLS, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS } from '@/constants'
import client from '@/services/client.service'
import { Bell, BellOff, Code, Copy, Link, SatelliteDish, Trash2, TriangleAlert, Pin } from 'lucide-react'
import { Event } from 'nostr-tools'
import { useMemo, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import RelayIcon from '../RelayIcon'

export interface SubMenuAction {
  label: React.ReactNode
  onClick: () => void
  className?: string
  separator?: boolean
}

export interface MenuAction {
  icon: React.ComponentType
  label: string
  onClick?: () => void
  className?: string
  separator?: boolean
  subMenu?: SubMenuAction[]
}

interface UseMenuActionsProps {
  event: Event
  closeDrawer: () => void
  showSubMenuActions: (subMenu: SubMenuAction[], title: string) => void
  setIsRawEventDialogOpen: (open: boolean) => void
  setIsReportDialogOpen: (open: boolean) => void
  isSmallScreen: boolean
}

export function useMenuActions({
  event,
  closeDrawer,
  showSubMenuActions,
  setIsRawEventDialogOpen,
  setIsReportDialogOpen,
  isSmallScreen
}: UseMenuActionsProps) {
  const { t } = useTranslation()
  const { pubkey, attemptDelete, publish } = useNostr()
  const { relayUrls: currentBrowsingRelayUrls } = useCurrentRelays()
  const { relaySets, favoriteRelays } = useFavoriteRelays()
  const relayUrls = useMemo(() => {
    return Array.from(new Set([
      ...currentBrowsingRelayUrls.map(url => normalizeUrl(url) || url),
      ...favoriteRelays.map(url => normalizeUrl(url) || url)
    ]))
  }, [currentBrowsingRelayUrls, favoriteRelays])
  const { mutePubkeyPublicly, mutePubkeyPrivately, unmutePubkey, mutePubkeySet } = useMuteList()
  const isMuted = useMemo(() => mutePubkeySet.has(event.pubkey), [mutePubkeySet, event])
  
  // Check if event is pinned
  const [isPinned, setIsPinned] = useState(false)
  
  useEffect(() => {
    const checkIfPinned = async () => {
      if (!pubkey) {
        setIsPinned(false)
        return
      }
      try {
        // Build comprehensive relay list for pin status check
        const allRelays = [
          ...(currentBrowsingRelayUrls || []),
          ...(favoriteRelays || []),
          ...BIG_RELAY_URLS,
          ...FAST_READ_RELAY_URLS,
          ...FAST_WRITE_RELAY_URLS
        ]
        
        const normalizedRelays = allRelays
          .map(url => normalizeUrl(url))
          .filter((url): url is string => !!url)
        
        const comprehensiveRelays = Array.from(new Set(normalizedRelays))
        
        // Try to fetch pin list event from comprehensive relay list first
        let pinListEvent = null
        try {
          const pinListEvents = await client.fetchEvents(comprehensiveRelays, {
            authors: [pubkey],
            kinds: [10001], // Pin list kind
            limit: 1
          })
          pinListEvent = pinListEvents[0] || null
        } catch (error) {
          console.warn('[PinStatus] Error fetching pin list from comprehensive relays, falling back to default method:', error)
          pinListEvent = await client.fetchPinListEvent(pubkey)
        }
        
        if (pinListEvent) {
          const isEventPinned = pinListEvent.tags.some(tag => tag[0] === 'e' && tag[1] === event.id)
          setIsPinned(isEventPinned)
        }
      } catch (error) {
        console.error('Error checking pin status:', error)
      }
    }
    checkIfPinned()
  }, [pubkey, event.id, currentBrowsingRelayUrls, favoriteRelays])
  
  const handlePinNote = async () => {
    if (!pubkey) return
    
    try {
      // Build comprehensive relay list for pin list fetching
      const allRelays = [
        ...(currentBrowsingRelayUrls || []),
        ...(favoriteRelays || []),
        ...BIG_RELAY_URLS,
        ...FAST_READ_RELAY_URLS,
        ...FAST_WRITE_RELAY_URLS
      ]
      
      const normalizedRelays = allRelays
        .map(url => normalizeUrl(url))
        .filter((url): url is string => !!url)
      
      const comprehensiveRelays = Array.from(new Set(normalizedRelays))
      
      // Try to fetch pin list event from comprehensive relay list first
      let pinListEvent = null
      try {
        const pinListEvents = await client.fetchEvents(comprehensiveRelays, {
          authors: [pubkey],
          kinds: [10001], // Pin list kind
          limit: 1
        })
        pinListEvent = pinListEvents[0] || null
      } catch (error) {
        console.warn('[PinNote] Error fetching pin list from comprehensive relays, falling back to default method:', error)
        pinListEvent = await client.fetchPinListEvent(pubkey)
      }
      
      console.log('[PinNote] Current pin list event:', pinListEvent)
      
      // Get existing event IDs, excluding the one we're toggling
      const existingEventIds = (pinListEvent?.tags || [])
        .filter(tag => tag[0] === 'e' && tag[1])
        .map(tag => tag[1])
        .filter(id => id !== event.id)
      
      console.log('[PinNote] Existing event IDs (excluding current):', existingEventIds)
      console.log('[PinNote] Current event ID:', event.id)
      console.log('[PinNote] Is currently pinned:', isPinned)
      
      let newTags: string[][]
      let successMessage: string
      
      if (isPinned) {
        // Unpin: just keep the existing tags without this event
        newTags = existingEventIds.map(id => ['e', id])
        successMessage = t('Note unpinned')
        console.log('[PinNote] Unpinning - new tags:', newTags)
      } else {
        // Pin: add this event to the existing list
        newTags = [...existingEventIds.map(id => ['e', id]), ['e', event.id]]
        successMessage = t('Note pinned')
        console.log('[PinNote] Pinning - new tags:', newTags)
      }
      
      // Create and publish the new pin list event
      console.log('[PinNote] Publishing new pin list event with', newTags.length, 'tags')
      console.log('[PinNote] Publishing to comprehensive relays:', comprehensiveRelays)
      await publish({
        kind: 10001,
        tags: newTags,
        content: '',
        created_at: Math.floor(Date.now() / 1000)
      }, {
        specifiedRelayUrls: comprehensiveRelays
      })
      
      // Update local state - the publish will update the cache automatically
      setIsPinned(!isPinned)
      toast.success(successMessage)
      closeDrawer()
    } catch (error) {
      console.error('Error pinning/unpinning note:', error)
      toast.error(t('Failed to pin note'))
    }
  }
  
  // Check if this is a reply to a discussion event
  const [isReplyToDiscussion, setIsReplyToDiscussion] = useState(false)
  
  useEffect(() => {
    const isDiscussion = event.kind === ExtendedKind.DISCUSSION
    if (isDiscussion) return // Already a discussion event
    
    const rootEventId = getRootEventHexId(event)
    if (rootEventId) {
      // Fetch the root event to check if it's a discussion
      client.fetchEvent(rootEventId).then(rootEvent => {
        if (rootEvent && rootEvent.kind === ExtendedKind.DISCUSSION) {
          setIsReplyToDiscussion(true)
        }
      }).catch(() => {
        // If we can't fetch the root event, assume it's not a discussion reply
        setIsReplyToDiscussion(false)
      })
    }
  }, [event.id, event.kind])

  const broadcastSubMenu: SubMenuAction[] = useMemo(() => {
    const items = []
    if (pubkey && event.pubkey === pubkey) {
      items.push({
        label: <div className="text-left"> {t('Write relays')}</div>,
        onClick: async () => {
          closeDrawer()
          const promise = async () => {
            const relays = await client.determineTargetRelays(event)
            if (relays?.length) {
              await client.publishEvent(relays, event)
            }
          }
          toast.promise(promise, {
            loading: t('Republishing...'),
            success: () => {
              return t('Successfully republish to your write relays')
            },
            error: (err) => {
              return t('Failed to republish to your write relays: {{error}}', {
                error: err.message
              })
            }
          })
        }
      })
    }

    if (relaySets.length) {
      items.push(
        ...relaySets
          .filter((set) => set.relayUrls.length)
          .map((set, index) => ({
            label: <div className="text-left truncate">{set.name}</div>,
            onClick: async () => {
              closeDrawer()
              const promise = client.publishEvent(set.relayUrls, event)
              toast.promise(promise, {
                loading: t('Republishing...'),
                success: () => {
                  return t('Successfully republish to relay set: {{name}}', { name: set.name })
                },
                error: (err) => {
                  return t('Failed to republish to relay set: {{name}}. Error: {{error}}', {
                    name: set.name,
                    error: err.message
                  })
                }
              })
            },
            separator: index === 0
          }))
      )
    }

    if (relayUrls.length) {
      items.push(
        ...relayUrls.map((relay, index) => ({
          label: (
            <div className="flex items-center gap-2 w-full">
              <RelayIcon url={relay} />
              <div className="flex-1 truncate text-left">{simplifyUrl(relay)}</div>
            </div>
          ),
          onClick: async () => {
            closeDrawer()
            const promise = client.publishEvent([relay], event)
            toast.promise(promise, {
              loading: t('Republishing...'),
              success: () => {
                return t('Successfully republish to relay: {{url}}', { url: simplifyUrl(relay) })
              },
              error: (err) => {
                return t('Failed to republish to relay: {{url}}. Error: {{error}}', {
                  url: simplifyUrl(relay),
                  error: err.message
                })
              }
            })
          },
          separator: index === 0
        }))
      )
    }

    return items
  }, [pubkey, relayUrls, relaySets])

  const menuActions: MenuAction[] = useMemo(() => {
    const actions: MenuAction[] = [
      {
        icon: Copy,
        label: t('Copy event ID'),
        onClick: () => {
          navigator.clipboard.writeText(getNoteBech32Id(event))
          closeDrawer()
        }
      },
      {
        icon: Copy,
        label: t('Copy user ID'),
        onClick: () => {
          navigator.clipboard.writeText(pubkeyToNpub(event.pubkey) ?? '')
          closeDrawer()
        }
      },
      {
        icon: Link,
        label: t('Copy share link'),
        onClick: () => {
          navigator.clipboard.writeText(toNjump(getNoteBech32Id(event)))
          closeDrawer()
        }
      },
      {
        icon: Code,
        label: t('View raw event'),
        onClick: () => {
          closeDrawer()
          setIsRawEventDialogOpen(true)
        },
        separator: true
      }
    ]

    const isProtected = isProtectedEvent(event)
    const isDiscussion = event.kind === ExtendedKind.DISCUSSION
    if ((!isProtected || event.pubkey === pubkey) && !isDiscussion && !isReplyToDiscussion) {
      actions.push({
        icon: SatelliteDish,
        label: t('Republish to ...'),
        onClick: isSmallScreen
          ? () => showSubMenuActions(broadcastSubMenu, t('Republish to ...'))
          : undefined,
        subMenu: isSmallScreen ? undefined : broadcastSubMenu,
        separator: true
      })
    }

    if (pubkey && event.pubkey !== pubkey) {
      actions.push({
        icon: TriangleAlert,
        label: t('Report'),
        className: 'text-destructive focus:text-destructive',
        onClick: () => {
          closeDrawer()
          setIsReportDialogOpen(true)
        },
        separator: true
      })
    }

    if (pubkey && event.pubkey !== pubkey) {
      if (isMuted) {
        actions.push({
          icon: Bell,
          label: t('Unmute user'),
          onClick: () => {
            closeDrawer()
            unmutePubkey(event.pubkey)
          },
          className: 'text-destructive focus:text-destructive',
          separator: true
        })
      } else {
        actions.push(
          {
            icon: BellOff,
            label: t('Mute user privately'),
            onClick: () => {
              closeDrawer()
              mutePubkeyPrivately(event.pubkey)
            },
            className: 'text-destructive focus:text-destructive',
            separator: true
          },
          {
            icon: BellOff,
            label: t('Mute user publicly'),
            onClick: () => {
              closeDrawer()
              mutePubkeyPublicly(event.pubkey)
            },
            className: 'text-destructive focus:text-destructive'
          }
        )
      }
    }

    // Pin functionality available for any note (not just own notes)
    if (pubkey) {
      actions.push({
        icon: Pin,
        label: isPinned ? t('Unpin note') : t('Pin note'),
        onClick: () => {
          handlePinNote()
        },
        separator: true
      })
    }

    // Delete functionality only available for own notes
    if (pubkey && event.pubkey === pubkey) {
      actions.push({
        icon: Trash2,
        label: t('Try deleting this note'),
        onClick: () => {
          closeDrawer()
          attemptDelete(event)
        },
        className: 'text-destructive focus:text-destructive'
      })
    }

    return actions
  }, [
    t,
    event,
    pubkey,
    isMuted,
    isSmallScreen,
    broadcastSubMenu,
    closeDrawer,
    showSubMenuActions,
    setIsRawEventDialogOpen,
    setIsReportDialogOpen,
    mutePubkeyPrivately,
    mutePubkeyPublicly,
    unmutePubkey,
    attemptDelete,
    isPinned,
    handlePinNote
  ])

  return menuActions
}
