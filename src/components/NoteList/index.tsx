import NewNotesButton from '@/components/NewNotesButton'
import { Button } from '@/components/ui/button'
import {
  getReplaceableCoordinateFromEvent,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent
} from '@/lib/event'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import logger from '@/lib/logger'
import { isTouchDevice } from '@/lib/utils'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useDeletedEvent } from '@/providers/DeletedEventProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
import { useZap } from '@/providers/ZapProvider'
import client from '@/services/client.service'
import { TFeedSubRequest } from '@/types'
import dayjs from 'dayjs'
import { Event, kinds } from 'nostr-tools'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import PullToRefresh from 'react-simple-pull-to-refresh'
import { toast } from 'sonner'
import NoteCard, { NoteCardLoadingSkeleton } from '../NoteCard'

const LIMIT = 100
const ALGO_LIMIT = 100
const SHOW_COUNT = 10

const NoteList = forwardRef(
  (
    {
      subRequests,
      showKinds,
      filterMutedNotes = true,
      hideReplies = false,
      hideUntrustedNotes = false,
      areAlgoRelays = false,
      showRelayCloseReason = false,
      customHeader
    }: {
      subRequests: TFeedSubRequest[]
      showKinds: number[]
      filterMutedNotes?: boolean
      hideReplies?: boolean
      hideUntrustedNotes?: boolean
      areAlgoRelays?: boolean
      showRelayCloseReason?: boolean
      customHeader?: React.ReactNode
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { startLogin, pubkey } = useNostr()
    const { isUserTrusted } = useUserTrust()
    const { mutePubkeySet } = useMuteList()
    const { hideContentMentioningMutedUsers } = useContentPolicy()
    const { isEventDeleted } = useDeletedEvent()
    const { zapReplyThreshold } = useZap()
    const [events, setEvents] = useState<Event[]>([])
    const [newEvents, setNewEvents] = useState<Event[]>([])
    const [hasMore, setHasMore] = useState<boolean>(true)
    const [loading, setLoading] = useState(true)
    const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
    const [refreshCount, setRefreshCount] = useState(0)
    const [showCount, setShowCount] = useState(SHOW_COUNT)
    const supportTouch = useMemo(() => isTouchDevice(), [])
    const bottomRef = useRef<HTMLDivElement | null>(null)
    const topRef = useRef<HTMLDivElement | null>(null)

    const shouldHideEvent = useCallback(
      (evt: Event) => {
        // Check if this is a profile feed
        const isProfileFeed = subRequests.some(req => req.filter.authors && req.filter.authors.length === 1)
        
        if (isEventDeleted(evt)) {
          logger.component('NoteList', 'Event filtered: deleted', { id: evt.id, kind: evt.kind })
          return true
        }
        
        // Special handling for zaps - check threshold, but be more lenient for profile feeds
        if (evt.kind === kinds.Zap) {
          const zapInfo = getZapInfoFromEvent(evt)
          
          // For profile feeds, show all zaps from the profile owner
          // For timeline feeds, filter by threshold
          if (!isProfileFeed && zapInfo && zapInfo.amount < zapReplyThreshold) {
            logger.component('NoteList', 'Event filtered: zap below threshold', { 
              id: evt.id, 
              amount: zapInfo.amount, 
              threshold: zapReplyThreshold 
            })
            return true
          }
        } else if (hideReplies && isReplyNoteEvent(evt)) {
          logger.component('NoteList', 'Event filtered: reply hidden', { id: evt.id, kind: evt.kind })
          return true
        }
        
        if (hideUntrustedNotes && !isUserTrusted(evt.pubkey)) {
          logger.component('NoteList', 'Event filtered: untrusted user', { id: evt.id, pubkey: evt.pubkey.substring(0, 8) })
          return true
        }
        if (filterMutedNotes && mutePubkeySet.has(evt.pubkey)) {
          logger.component('NoteList', 'Event filtered: muted user', { id: evt.id, pubkey: evt.pubkey.substring(0, 8) })
          return true
        }
        if (
          filterMutedNotes &&
          hideContentMentioningMutedUsers &&
          isMentioningMutedUsers(evt, mutePubkeySet)
        ) {
          logger.component('NoteList', 'Event filtered: mentions muted users', { id: evt.id, kind: evt.kind })
          return true
        }

        return false
      },
      [hideReplies, hideUntrustedNotes, mutePubkeySet, isEventDeleted, zapReplyThreshold, subRequests]
    )

    const filteredEvents = useMemo(() => {
      const idSet = new Set<string>()
      const startTime = performance.now()

      const filtered = events.slice(0, showCount).filter((evt) => {
        if (shouldHideEvent(evt)) {
          return false
        }

        const id = isReplaceableEvent(evt.kind) ? getReplaceableCoordinateFromEvent(evt) : evt.id
        if (idSet.has(id)) {
          logger.component('NoteList', 'Event filtered: duplicate', { id: evt.id, kind: evt.kind })
          return false
        }
        idSet.add(id)
        return true
      })

      const endTime = performance.now()
      logger.perfComponent('NoteList', 'Event filtering completed', {
        totalEvents: events.length,
        filteredEvents: filtered.length,
        showCount,
        duration: `${(endTime - startTime).toFixed(2)}ms`
      })

      return filtered
    }, [events, showCount, shouldHideEvent])

    const filteredNewEvents = useMemo(() => {
      const idSet = new Set<string>()

      return newEvents.filter((event: Event) => {
        if (shouldHideEvent(event)) return false

        const id = isReplaceableEvent(event.kind)
          ? getReplaceableCoordinateFromEvent(event)
          : event.id
        if (idSet.has(id)) {
          return false
        }
        idSet.add(id)
        return true
      })
    }, [newEvents, shouldHideEvent])

    const scrollToTop = (behavior: ScrollBehavior = 'instant') => {
      setTimeout(() => {
        topRef.current?.scrollIntoView({ behavior, block: 'start' })
      }, 20)
    }

    const refresh = () => {
      scrollToTop()
      // Clear relay connection state to force fresh connections
      const relayUrls = subRequests.flatMap(req => req.urls)
      relayUrls.forEach(url => client.clearRelayConnectionState(url))
      setTimeout(() => {
        setRefreshCount((count) => count + 1)
      }, 500)
    }

    useImperativeHandle(ref, () => ({ scrollToTop, refresh }), [])

  useEffect(() => {
    logger.component('NoteList', 'useEffect triggered', { 
      subRequests: subRequests.length, 
      showKinds: showKinds.length,
      refreshCount 
    })
    
    if (!subRequests.length) {
      logger.component('NoteList', 'No subRequests, returning early')
      return
    }
    
    // Don't initialize if showKinds is empty (still loading from provider)
    if (showKinds.length === 0) {
      logger.component('NoteList', 'showKinds is empty, waiting for provider to initialize')
      return
    }

    async function init() {
        logger.component('NoteList', 'Initializing feed')
        setLoading(true)
        setEvents([])
        setNewEvents([])
        setHasMore(true)

        if (showKinds.length === 0) {
          logger.component('NoteList', 'showKinds is empty, no events will be displayed')
          setLoading(false)
          setHasMore(false)
          return () => {}
        }

        const finalFilters = subRequests.map(({ urls, filter }) => ({
          urls,
          filter: {
            kinds: showKinds,
            ...filter,
            limit: areAlgoRelays ? ALGO_LIMIT : LIMIT
          }
        }))
        
        const { closer, timelineKey } = await client.subscribeTimeline(
          finalFilters,
          {
            onEvents: (events, eosed) => {
              logger.component('NoteList', 'Received events from relay', { 
                eventsCount: events.length, 
                eosed,
                eventKinds: [...new Set(events.map(e => e.kind))].slice(0, 5)
              })
              
              if (events.length > 0) {
                setEvents(prevEvents => {
                  // For profile feeds, accumulate events from all relays
                  // For timeline feeds, replace events
                  const isProfileFeed = subRequests.some(req => req.filter.authors && req.filter.authors.length === 1)
                  
                  if (isProfileFeed) {
                    // Accumulate events, removing duplicates
                    const existingIds = new Set(prevEvents.map(e => e.id))
                    const newEvents = events.filter(e => !existingIds.has(e.id))
                    logger.component('NoteList', 'Profile feed - accumulating events', {
                      previous: prevEvents.length,
                      new: events.length,
                      unique: newEvents.length,
                      total: prevEvents.length + newEvents.length
                    })
                    return [...prevEvents, ...newEvents]
                  } else {
                    // Timeline feed - replace events
                    logger.component('NoteList', 'Timeline feed - replacing events', {
                      previous: prevEvents.length,
                      new: events.length
                    })
                    return events
                  }
                })
                // Stop loading as soon as we have events, don't wait for all relays
                setLoading(false)
              }
              if (areAlgoRelays) {
                setHasMore(false)
              }
              if (eosed) {
                logger.component('NoteList', 'EOSED - all relays finished', {
                  eventsCount: events.length,
                  hasMore: events.length > 0
                })
                setLoading(false)
                setHasMore(events.length > 0)
              }
            },
            onNew: (event) => {
              if (pubkey && event.pubkey === pubkey) {
                // If the new event is from the current user, insert it directly into the feed
                setEvents((oldEvents) =>
                  oldEvents.some((e) => e.id === event.id) ? oldEvents : [event, ...oldEvents]
                )
              } else {
                // Otherwise, buffer it and show the New Notes button
                setNewEvents((oldEvents) =>
                  [event, ...oldEvents].sort((a, b) => b.created_at - a.created_at)
                )
              }
            },
            onClose: (url, reason) => {
              logger.component('NoteList', 'Relay connection closed', { url, reason })
              if (!showRelayCloseReason) return
              // ignore reasons from nostr-tools
              if (
                [
                  'closed by caller',
                  'relay connection errored',
                  'relay connection closed',
                  'pingpong timed out',
                  'relay connection closed by us'
                ].includes(reason)
              ) {
                return
              }

              toast.error(`${url}: ${reason}`)
            }
          },
          {
            startLogin,
            needSort: !areAlgoRelays
          }
        )
        
        // Add a fallback timeout to prevent infinite loading
        // Increased timeout to 15 seconds to handle slow relay connections
        const fallbackTimeout = setTimeout(() => {
          if (loading) {
            setLoading(false)
            logger.component('NoteList', 'Loading timeout - stopping after 15 seconds')
          }
        }, 15000)
        
        setTimelineKey(timelineKey)
        return () => {
          clearTimeout(fallbackTimeout)
          closer?.()
        }
      }

      const promise = init()
      return () => {
        promise.then((closer) => closer())
      }
    }, [subRequests, refreshCount, showKinds])

    useEffect(() => {
      const options = {
        root: null,
        rootMargin: '10px',
        threshold: 0.1
      }

      const loadMore = async () => {
        if (showCount < events.length) {
          setShowCount((prev) => prev + SHOW_COUNT)
          // preload more
          if (events.length - showCount > LIMIT / 2) {
            return
          }
        }

        if (!timelineKey || loading || !hasMore) return
        setLoading(true)
        const newEvents = await client.loadMoreTimeline(
          timelineKey,
          events.length ? events[events.length - 1].created_at - 1 : dayjs().unix(),
          LIMIT
        )
        setLoading(false)
        if (newEvents.length === 0) {
          setHasMore(false)
          return
        }
        setEvents((oldEvents) => [...oldEvents, ...newEvents])
      }

      const observerInstance = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          loadMore()
        }
      }, options)

      const currentBottomRef = bottomRef.current

      if (currentBottomRef) {
        observerInstance.observe(currentBottomRef)
      }

      return () => {
        if (observerInstance && currentBottomRef) {
          observerInstance.unobserve(currentBottomRef)
        }
      }
    }, [loading, hasMore, events, showCount, timelineKey])

    const showNewEvents = () => {
      setEvents((oldEvents) => [...newEvents, ...oldEvents])
      setNewEvents([])
      setTimeout(() => {
        scrollToTop('smooth')
      }, 0)
    }

    logger.component('NoteList', 'Rendering with state', {
      eventsCount: events.length,
      filteredEventsCount: filteredEvents.length,
      loading,
      hasMore,
      showKinds: showKinds.length
    })

    const list = (
      <div className="min-h-screen">
        {customHeader}
        {filteredEvents.map((event) => (
          <NoteCard
            key={event.id}
            className="w-full"
            event={event}
            filterMutedNotes={filterMutedNotes}
          />
        ))}
        {hasMore || loading ? (
          <div ref={bottomRef}>
            <NoteCardLoadingSkeleton />
          </div>
        ) : events.length ? (
          <div className="text-center text-sm text-muted-foreground mt-2">{t('no more notes')}</div>
        ) : (
          <div className="flex justify-center w-full mt-2">
            <Button size="lg" onClick={() => {
              logger.component('NoteList', 'Reload button clicked, refreshing feed')
              // Clear relay connection state to force fresh connections
              const relayUrls = subRequests.flatMap(req => req.urls)
              relayUrls.forEach(url => client.clearRelayConnectionState(url))
              setRefreshCount((count) => count + 1)
            }}>
              {t('reload notes')}
            </Button>
          </div>
        )}
      </div>
    )

    return (
      <div>
        {filteredNewEvents.length > 0 && (
          <NewNotesButton newEvents={filteredNewEvents} onClick={showNewEvents} />
        )}
        <div ref={topRef} className="scroll-mt-[calc(6rem+1px)]" />
        {supportTouch ? (
          <PullToRefresh
            onRefresh={async () => {
              refresh()
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }}
            pullingContent=""
          >
            {list}
          </PullToRefresh>
        ) : (
          list
        )}
        <div className="h-40" />
      </div>
    )
  }
)
NoteList.displayName = 'NoteList'
export default NoteList

export type TNoteListRef = {
  scrollToTop: (behavior?: ScrollBehavior) => void
  refresh: () => void
}
