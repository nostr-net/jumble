import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { compareEvents } from '@/lib/event'
import { notificationFilter } from '@/lib/notification'
import { usePrimaryPage } from '@/PageManager'
import client from '@/services/client.service'
import storage from '@/services/local-storage.service'
import { kinds, NostrEvent } from 'nostr-tools'
import { SubCloser } from 'nostr-tools/abstract-pool'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useContentPolicy } from './ContentPolicyProvider'
import { useMuteList } from './MuteListProvider'
import { useNostr } from './NostrProvider'
import { useUserTrust } from './UserTrustProvider'
// import { useInterestList } from './InterestListProvider' // No longer needed

type TNotificationContext = {
  hasNewNotification: boolean
  getNotificationsSeenAt: () => number
  isNotificationRead: (id: string) => boolean
  markNotificationAsRead: (id: string) => void
}

const NotificationContext = createContext<TNotificationContext | undefined>(undefined)

export const useNotification = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { current } = usePrimaryPage()
  const active = useMemo(() => current === 'notifications', [current])
  const { pubkey, notificationsSeenAt, updateNotificationsSeenAt } = useNostr()
  const { hideUntrustedNotifications, isUserTrusted } = useUserTrust()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  // const { getSubscribedTopics } = useInterestList() // No longer needed since we subscribe to all discussions
  const [newNotifications, setNewNotifications] = useState<NostrEvent[]>([])
  const [readNotificationIdSet, setReadNotificationIdSet] = useState<Set<string>>(new Set())
  const filteredNewNotifications = useMemo(() => {
    if (active || notificationsSeenAt < 0) {
      return []
    }
    const filtered: NostrEvent[] = []
    for (const notification of newNotifications) {
      if (notification.created_at <= notificationsSeenAt || filtered.length >= 10) {
        break
      }
      if (
        !notificationFilter(notification, {
          pubkey,
          mutePubkeySet,
          hideContentMentioningMutedUsers,
          hideUntrustedNotifications,
          isUserTrusted
        })
      ) {
        continue
      }
      filtered.push(notification)
    }
    return filtered
  }, [
    newNotifications,
    notificationsSeenAt,
    mutePubkeySet,
    hideContentMentioningMutedUsers,
    hideUntrustedNotifications,
    isUserTrusted,
    active
  ])

  useEffect(() => {
    setNewNotifications([])
    updateNotificationsSeenAt(!active)
  }, [active])

  useEffect(() => {
    if (!pubkey) return

    setNewNotifications([])
    setReadNotificationIdSet(new Set())

    // Track if component is mounted
    const isMountedRef = { current: true }
    const subCloserRef: {
      current: SubCloser | null
    } = { current: null }
    const topicSubCloserRef: {
      current: SubCloser | null
    } = { current: null }

    const subscribe = async () => {
      if (subCloserRef.current) {
        subCloserRef.current.close()
        subCloserRef.current = null
      }
      if (topicSubCloserRef.current) {
        topicSubCloserRef.current.close()
        topicSubCloserRef.current = null
      }
      if (!isMountedRef.current) return null

      try {
        let eosed = false
        const relayList = await client.fetchRelayList(pubkey)
        const notificationRelays = relayList.read.length > 0 ? relayList.read.slice(0, 5) : BIG_RELAY_URLS
        
        // Subscribe to discussion notifications (kind 11)
        // Subscribe to all discussions, not just subscribed topics
        let discussionEosed = false
        const discussionSubCloser = client.subscribe(
          notificationRelays,
          [
            {
              kinds: [11], // Discussion threads
              limit: 20
            }
          ],
          {
            oneose: (e) => {
              if (e) {
                discussionEosed = e
              }
            },
            onevent: (evt) => {
              // Don't notify about our own threads
              if (evt.pubkey !== pubkey) {
                setNewNotifications((prev) => {
                  if (!discussionEosed) {
                    return [evt, ...prev]
                  }
                  if (prev.length && compareEvents(prev[0], evt) >= 0) {
                    return prev
                  }

                  client.emitNewEvent(evt)
                  return [evt, ...prev]
                })
              }
            }
          }
        )
        topicSubCloserRef.current = discussionSubCloser
        
        // Regular notifications subscription
        const subCloser = client.subscribe(
          notificationRelays,
          [
            {
              kinds: [
                kinds.ShortTextNote,
                kinds.Repost,
                kinds.Reaction,
                kinds.Zap,
                ExtendedKind.COMMENT,
                ExtendedKind.POLL_RESPONSE,
                ExtendedKind.VOICE_COMMENT,
                ExtendedKind.POLL,
                ExtendedKind.PUBLIC_MESSAGE
              ],
              '#p': [pubkey],
              limit: 20
            }
          ],
          {
            oneose: (e) => {
              if (e) {
                eosed = e
                setNewNotifications((prev) => {
                  return [...prev.sort((a, b) => compareEvents(b, a))]
                })
              }
            },
            onevent: (evt) => {
              if (evt.pubkey !== pubkey) {
                setNewNotifications((prev) => {
                  if (!eosed) {
                    return [evt, ...prev]
                  }
                  if (prev.length && compareEvents(prev[0], evt) >= 0) {
                    return prev
                  }

                  client.emitNewEvent(evt)
                  return [evt, ...prev]
                })
              }
            },
            onAllClose: (reasons) => {
              if (reasons.every((reason) => reason === 'closed by caller')) {
                return
              }

              // Only reconnect if still mounted and not a manual close
              if (isMountedRef.current) {
                setTimeout(() => {
                  if (isMountedRef.current) {
                    subscribe()
                  }
                }, 5_000)
              }
            }
          }
        )

        subCloserRef.current = subCloser
        return subCloser
      } catch (error) {
        console.error('Subscription error:', error)

        // Retry on error if still mounted
        if (isMountedRef.current) {
          setTimeout(() => {
            if (isMountedRef.current) {
              subscribe()
            }
          }, 5_000)
        }
        return null
      }
    }

    // Initial subscription
    subscribe()

    // Cleanup function
    return () => {
      isMountedRef.current = false
      if (subCloserRef.current) {
        subCloserRef.current.close()
        subCloserRef.current = null
      }
      if (topicSubCloserRef.current) {
        topicSubCloserRef.current.close()
        topicSubCloserRef.current = null
      }
    }
  }, [pubkey])

  useEffect(() => {
    const newNotificationCount = filteredNewNotifications.length

    // Update title
    if (newNotificationCount > 0) {
      document.title = `(${newNotificationCount >= 10 ? '9+' : newNotificationCount}) Jumble`
    } else {
      document.title = 'Jumble'
    }

    // Update favicons
    const favicons = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']")
    if (!favicons.length) return

    const treeFavicon = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌲</text></svg>"

    if (newNotificationCount === 0) {
      favicons.forEach((favicon) => {
        favicon.href = treeFavicon
      })
    } else {
      // Create a canvas with the tree emoji and a notification badge
      const canvas = document.createElement('canvas')
      const size = 64
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      
      // Draw tree emoji as text
      ctx.font = `${size * 0.9}px Arial`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'center'
      ctx.fillText('🌲', size / 2, size / 2)
      
      // Draw red notification badge
      const r = size * 0.16
      ctx.beginPath()
      ctx.arc(size - r - 6, r + 6, r, 0, 2 * Math.PI)
      ctx.fillStyle = '#FF0000'
      ctx.fill()
      
      favicons.forEach((favicon) => {
        favicon.href = canvas.toDataURL('image/png')
      })
    }
  }, [filteredNewNotifications])

  const getNotificationsSeenAt = () => {
    if (notificationsSeenAt >= 0) {
      return notificationsSeenAt
    }
    if (pubkey) {
      return storage.getLastReadNotificationTime(pubkey)
    }
    return 0
  }

  const isNotificationRead = (notificationId: string): boolean => {
    return readNotificationIdSet.has(notificationId)
  }

  const markNotificationAsRead = (notificationId: string): void => {
    setReadNotificationIdSet((prev) => new Set([...prev, notificationId]))
  }

  return (
    <NotificationContext.Provider
      value={{
        hasNewNotification: filteredNewNotifications.length > 0,
        getNotificationsSeenAt,
        isNotificationRead,
        markNotificationAsRead
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}
