import { FAST_READ_RELAY_URLS, ExtendedKind } from '@/constants'
import {
  getParentETag,
  getReplaceableCoordinateFromEvent,
  getRootATag,
  getRootETag,
  getRootEventHexId,
  isMentioningMutedUsers,
  isReplaceableEvent,
  isReplyNoteEvent
} from '@/lib/event'
import logger from '@/lib/logger'
import { toNote } from '@/lib/link'
import { generateBech32IdFromETag, tagNameEquals } from '@/lib/tag'
import { normalizeUrl } from '@/lib/url'
import { useSmartNoteNavigation } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useFeed } from '@/providers/FeedProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
// DEPRECATED: useUserPreferences removed - double-panel functionality disabled
import client from '@/services/client.service'
import noteStatsService from '@/services/note-stats.service'
import { Filter, Event as NEvent, kinds } from 'nostr-tools'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadingBar } from '../LoadingBar'
import ReplyNote, { ReplyNoteSkeleton } from '../ReplyNote'

type TRootInfo =
  | { type: 'E'; id: string; pubkey: string }
  | { type: 'A'; id: string; eventId: string; pubkey: string; relay?: string }
  | { type: 'I'; id: string }

const LIMIT = 100
const SHOW_COUNT = 10

function ReplyNoteList({ event, sort = 'oldest' }: { index?: number; event: NEvent; sort?: 'newest' | 'oldest' | 'top' | 'controversial' | 'most-zapped' }) {
  console.log('[ReplyNoteList] Component rendered for event:', event.id.substring(0, 8))
  
  const { t } = useTranslation()
  const { navigateToNote } = useSmartNoteNavigation()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const { relayList: userRelayList } = useNostr()
  const { relayUrls: currentFeedRelays } = useFeed()
  // DEPRECATED: showRecommendedRelaysPanel removed - double-panel functionality disabled
  const [rootInfo, setRootInfo] = useState<TRootInfo | undefined>(undefined)
  const { repliesMap, addReplies } = useReply()

  // Helper function to get vote score for a reply
  const getReplyVoteScore = (reply: NEvent) => {
    const stats = noteStatsService.getNoteStats(reply.id)
    if (!stats?.likes) {
      return 0
    }
    
    const upvoteReactions = stats.likes.filter(r => r.emoji === '⬆️')
    const downvoteReactions = stats.likes.filter(r => r.emoji === '⬇️')
    const score = upvoteReactions.length - downvoteReactions.length
    
    return score
  }

  // Helper function to get controversy score for a reply
  const getReplyControversyScore = (reply: NEvent) => {
    const stats = noteStatsService.getNoteStats(reply.id)
    if (!stats?.likes) {
      return 0
    }
    
    const upvoteReactions = stats.likes.filter(r => r.emoji === '⬆️')
    const downvoteReactions = stats.likes.filter(r => r.emoji === '⬇️')
    
    // Controversy = minimum of upvotes and downvotes (both need to be high)
    const controversy = Math.min(upvoteReactions.length, downvoteReactions.length)
    return controversy
  }

  // Helper function to get total zap amount for a reply
  const getReplyZapAmount = (reply: NEvent) => {
    const stats = noteStatsService.getNoteStats(reply.id)
    if (!stats?.zaps) {
      return 0
    }
    
    const totalAmount = stats.zaps.reduce((sum, zap) => sum + zap.amount, 0)
    return totalAmount
  }
  const replies = useMemo(() => {
    const replyIdSet = new Set<string>()
    const replyEvents: NEvent[] = []
    const currentEventKey = isReplaceableEvent(event.kind)
      ? getReplaceableCoordinateFromEvent(event)
      : event.id
    // For replaceable events, also check the event ID in case replies are stored there
    const eventIdKey = event.id
    const parentEventKeys = [currentEventKey]
    if (isReplaceableEvent(event.kind) && currentEventKey !== eventIdKey) {
      parentEventKeys.push(eventIdKey)
    }

    // FIXED: Only fetch direct replies to the original event, don't traverse reply chains
    // This prevents the doom loop that was causing "too many concurrent REQS"
    const events = parentEventKeys.flatMap((id) => repliesMap.get(id)?.events || [])
    
    console.log('🔍 [ReplyNoteList] Processing replies:', {
      eventId: event.id.substring(0, 8),
      parentEventKeys,
      eventsFromMap: events.length,
      repliesMapSize: repliesMap.size,
      repliesMapKeys: Array.from(repliesMap.keys()).map(k => k.substring(0, 8))
    })
    
    events.forEach((evt) => {
      if (replyIdSet.has(evt.id)) {
        console.log('🔍 [ReplyNoteList] Skipping duplicate event:', evt.id.substring(0, 8))
        return
      }
      if (mutePubkeySet.has(evt.pubkey)) {
        console.log('🔍 [ReplyNoteList] Skipping muted user event:', evt.id.substring(0, 8), 'pubkey:', evt.pubkey.substring(0, 8))
        return
      }
      if (hideContentMentioningMutedUsers && isMentioningMutedUsers(evt, mutePubkeySet)) {
        console.log('🔍 [ReplyNoteList] Skipping event mentioning muted users:', evt.id.substring(0, 8))
        return
      }

      replyIdSet.add(evt.id)
      replyEvents.push(evt)
      console.log('✅ [ReplyNoteList] Added reply event:', evt.id.substring(0, 8), 'kind:', evt.kind)
    })
    


    // Apply sorting based on the sort parameter
    switch (sort) {
      case 'oldest':
        return replyEvents.sort((a, b) => a.created_at - b.created_at)
      case 'newest':
        return replyEvents.sort((a, b) => b.created_at - a.created_at)
      case 'top':
        // Sort by vote score (upvotes - downvotes), then by newest if tied
        return replyEvents.sort((a, b) => {
          const scoreA = getReplyVoteScore(a)
          const scoreB = getReplyVoteScore(b)
          if (scoreA !== scoreB) {
            return scoreB - scoreA // Higher scores first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
      case 'controversial':
        // Sort by controversy score (min of upvotes and downvotes), then by newest if tied
        return replyEvents.sort((a, b) => {
          const controversyA = getReplyControversyScore(a)
          const controversyB = getReplyControversyScore(b)
          if (controversyA !== controversyB) {
            return controversyB - controversyA // Higher controversy first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
      case 'most-zapped':
        // Sort by total zap amount, then by newest if tied
        return replyEvents.sort((a, b) => {
          const zapAmountA = getReplyZapAmount(a)
          const zapAmountB = getReplyZapAmount(b)
          if (zapAmountA !== zapAmountB) {
            return zapAmountB - zapAmountA // Higher zap amounts first
          }
          return b.created_at - a.created_at // Newest first if tied
        })
      default:
        return replyEvents.sort((a, b) => b.created_at - a.created_at)
    }
  }, [event.id, repliesMap, mutePubkeySet, hideContentMentioningMutedUsers, sort])
  
  // Debug the final replies count
  console.log('📊 [ReplyNoteList] Final replies count:', replies.length)
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [until, setUntil] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [highlightReplyId, setHighlightReplyId] = useState<string | undefined>(undefined)
  const replyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const requestTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    console.log('[ReplyNoteList] fetchRootEvent useEffect triggered for event:', event.id.substring(0, 8))
    const fetchRootEvent = async () => {
      let root: TRootInfo
      
      if (isReplaceableEvent(event.kind)) {
        root = {
          type: 'A',
          id: getReplaceableCoordinateFromEvent(event),
          eventId: event.id,
          pubkey: event.pubkey,
          relay: client.getEventHint(event.id)
        }
      } else {
        root = { type: 'E', id: event.id, pubkey: event.pubkey }
      }
      
      const rootETag = getRootETag(event)
      if (rootETag) {
        const [, rootEventHexId, , , rootEventPubkey] = rootETag
        if (rootEventHexId && rootEventPubkey) {
          root = { type: 'E', id: rootEventHexId, pubkey: rootEventPubkey }
        } else {
          const rootEventId = generateBech32IdFromETag(rootETag)
          if (rootEventId) {
            const rootEvent = await client.fetchEvent(rootEventId)
            if (rootEvent) {
              root = { type: 'E', id: rootEvent.id, pubkey: rootEvent.pubkey }
            }
          }
        }
      } else if (event.kind === ExtendedKind.COMMENT) {
        const rootATag = getRootATag(event)
        if (rootATag) {
          const [, coordinate, relay] = rootATag
          const [, pubkey] = coordinate.split(':')
          root = { type: 'A', id: coordinate, eventId: event.id, pubkey, relay }
        }
        const rootITag = event.tags.find(tagNameEquals('I'))
        if (rootITag) {
          root = { type: 'I', id: rootITag[1] }
        }
      }
      logger.debug('[ReplyNoteList] Root info determined:', {
        eventId: event.id.substring(0, 8),
        rootInfo: root,
        eventKind: event.kind
      })
      console.log('🏗️ [ReplyNoteList] Setting rootInfo:', root)
      setRootInfo(root)
    }
    fetchRootEvent()
  }, [event])

  const onNewReply = useCallback((evt: NEvent) => {
    addReplies([evt])
  }, [])

  useEffect(() => {
    if (!rootInfo) return
    const handleEventPublished = (data: Event) => {
      const customEvent = data as CustomEvent<NEvent>
      const evt = customEvent.detail
      const rootId = getRootEventHexId(evt)
      if (rootId === rootInfo.id && isReplyNoteEvent(evt)) {
        onNewReply(evt)
      }
    }

    client.addEventListener('newEvent', handleEventPublished)
    return () => {
      client.removeEventListener('newEvent', handleEventPublished)
    }
  }, [rootInfo, onNewReply])

  useEffect(() => {
    console.log('⚡ [ReplyNoteList] Main useEffect triggered:', {
      loading,
      hasRootInfo: !!rootInfo,
      shouldInit: !loading && !!rootInfo,
      rootInfo
    })
    
    if (loading || !rootInfo) {
      console.log('❌ [ReplyNoteList] Early return - conditions not met:', {
        loading,
        hasRootInfo: !!rootInfo,
        rootInfo
      })
      return
    }
    
    console.log('✅ [ReplyNoteList] All conditions met, starting reply fetch...')
    
    // Clear any existing timeout to prevent multiple simultaneous requests
    if (requestTimeoutRef.current) {
      clearTimeout(requestTimeoutRef.current)
    }
    
    // Debounce the request to prevent rapid successive calls
    requestTimeoutRef.current = setTimeout(() => {
      console.log('[ReplyNoteList] Debounced request starting...')
      
      // Check if we're already loading to prevent duplicate requests
      if (loading) {
        console.log('[ReplyNoteList] Already loading, skipping request')
        return
      }

        const init = async () => {
          setLoading(true)

          try {
            
            // For replies, always use a comprehensive relay list to ensure we find replies
            // Don't rely on currentFeedRelays as it might be limited to a single relay
            console.log('[ReplyNoteList] Current feed relays:', currentFeedRelays)
            
            // Always build comprehensive relay list for replies to ensure we find them
            const userReadRelays = userRelayList?.read || []
            const userWriteRelays = userRelayList?.write || []
            const eventHints = client.getEventHints(event.id)
            
            const allRelays = [
              ...userReadRelays.map(url => normalizeUrl(url) || url),
              ...userWriteRelays.map(url => normalizeUrl(url) || url),
              ...eventHints.map(url => normalizeUrl(url) || url),
              ...FAST_READ_RELAY_URLS.map(url => normalizeUrl(url) || url),
            ]
            
            const finalRelayUrls = Array.from(new Set(allRelays.filter(Boolean)))
            console.log('[ReplyNoteList] Using comprehensive relay list for replies:', finalRelayUrls)
            
            logger.debug('[ReplyNoteList] Fetching replies for event:', {
              eventId: event.id.substring(0, 8),
              rootInfo,
              finalRelayUrls: finalRelayUrls.slice(0, 5), // Log first 5 relays
              totalRelays: finalRelayUrls.length
            })

        const filters: (Omit<Filter, 'since' | 'until'> & {
          limit: number
        })[] = []
        if (rootInfo.type === 'E') {
          // Fetch all reply types for event-based replies
          filters.push({
            '#e': [rootInfo.id],
            kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
            limit: LIMIT
          })
          // Also fetch with uppercase E tag for replaceable events
          filters.push({
            '#E': [rootInfo.id],
            kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
            limit: LIMIT
          })
          // For public messages (kind 24), also look for replies using 'q' tags
          if (event.kind === ExtendedKind.PUBLIC_MESSAGE) {
            filters.push({
              '#q': [rootInfo.id],
              kinds: [ExtendedKind.PUBLIC_MESSAGE],
              limit: LIMIT
            })
          }
        } else if (rootInfo.type === 'A') {
          // Fetch all reply types for replaceable event-based replies
          filters.push(
            {
              '#a': [rootInfo.id],
              kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
              limit: LIMIT
            },
            {
              '#A': [rootInfo.id],
              kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
              limit: LIMIT
            }
          )
          if (rootInfo.relay) {
            finalRelayUrls.push(rootInfo.relay)
          }
        }


        
        const { closer, timelineKey } = await client.subscribeTimeline(
          filters.map((filter) => ({
            urls: finalRelayUrls, // Use current feed's relay selection
            filter
          })),
          {
              onEvents: (evts, eosed) => {
                logger.debug('[ReplyNoteList] Received events:', {
                  totalEvents: evts.length,
                  eosed,
                  eventIds: evts.map(e => e.id.substring(0, 8))
                })
                console.log('📥 [ReplyNoteList] Received events:', evts.length, 'eosed:', eosed)
                if (evts.length > 0) {
                  const regularReplies = evts.filter((evt) => isReplyNoteEvent(evt))
                  console.log('🔍 [ReplyNoteList] Filtered replies:', {
                    replyCount: regularReplies.length,
                    replyIds: regularReplies.map(r => r.id.substring(0, 8))
                  })
                  console.log('➕ [ReplyNoteList] Adding replies to map:', regularReplies.length)
                  addReplies(regularReplies)
                } else {
                  console.log('❌ [ReplyNoteList] No events received')
                }
              if (eosed) {
                setUntil(evts.length >= LIMIT ? evts[evts.length - 1].created_at - 1 : undefined)
                setLoading(false)
              }
            },
            onNew: (evt) => {
              if (isReplyNoteEvent(evt)) {
                addReplies([evt])
              }
            }
          }
        )
        
        // Add a fallback timeout to prevent infinite loading
        const fallbackTimeout = setTimeout(() => {
          if (loading) {
            setLoading(false)
            logger.debug('Reply loading timeout - stopping after 8 seconds')
          }
        }, 8000)
        setTimelineKey(timelineKey)
        return () => {
          clearTimeout(fallbackTimeout)
          closer?.()
        }
      } catch {
        setLoading(false)
      }
      return
    }

    const promise = init()
    return () => {
      promise.then((closer) => closer?.())
    }
    }, 500) // 500ms debounce delay
    
    return () => {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current)
      }
    }
  }, [rootInfo, onNewReply, loading])

  useEffect(() => {
    // Only try to load more if we have no replies, not loading, have a timeline key, and haven't reached the end
    if (replies.length === 0 && !loading && timelineKey && until !== undefined) {
      loadMore()
    }
  }, [replies.length, loading, timelineKey, until])
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current)
      }
    }
  }, []) // Added until to prevent infinite loops

  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '10px',
      threshold: 0.1
    }

    const observerInstance = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && showCount < replies.length) {
        setShowCount((prev) => prev + SHOW_COUNT)
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
  }, [replies, showCount])

  const loadMore = useCallback(async () => {
    if (loading || !until || !timelineKey) return

    setLoading(true)
    const events = await client.loadMoreTimeline(timelineKey, until, LIMIT)
    const olderEvents = events.filter((evt) => isReplyNoteEvent(evt))
    if (olderEvents.length > 0) {
      addReplies(olderEvents)
    }
    setUntil(events.length ? events[events.length - 1].created_at - 1 : undefined)
    setLoading(false)
  }, [loading, until, timelineKey])

  const highlightReply = useCallback((eventId: string, scrollTo = true) => {
    if (scrollTo) {
      const ref = replyRefs.current[eventId]
      if (ref) {
        ref.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
    setHighlightReplyId(eventId)
    setTimeout(() => {
      setHighlightReplyId((pre) => (pre === eventId ? undefined : pre))
    }, 1500)
  }, [])

  return (
    <div className="min-h-[80vh]">
      {loading && <LoadingBar />}
      {!loading && until && (
        <div
          className={`text-sm text-center text-muted-foreground border-b py-2 ${!loading ? 'hover:text-foreground cursor-pointer' : ''}`}
          onClick={loadMore}
        >
          {t('load more older replies')}
        </div>
      )}
      <div>
        {replies.slice(0, showCount).map((reply) => {
          if (hideUntrustedInteractions && !isUserTrusted(reply.pubkey)) {
            const repliesForThisReply = repliesMap.get(reply.id)
            // If the reply is not trusted and there are no trusted replies for this reply, skip rendering
            if (
              !repliesForThisReply ||
              repliesForThisReply.events.every((evt) => !isUserTrusted(evt.pubkey))
            ) {
              return null
            }
          }

          const parentETag = getParentETag(reply)
          const parentEventHexId = parentETag?.[1]
          const parentEventId = parentETag ? generateBech32IdFromETag(parentETag) : undefined
          
          // Debug logging for parent event detection
          logger.debug('[ReplyNoteList] Reply parent info:', {
            replyId: reply.id.substring(0, 8),
            parentETag,
            parentEventHexId: parentEventHexId?.substring(0, 8),
            parentEventId: parentEventId?.substring(0, 8),
            isDifferentFromCurrent: event.id !== parentEventHexId,
            currentEventId: event.id.substring(0, 8)
          })
          return (
            <div
              ref={(el) => (replyRefs.current[reply.id] = el)}
              key={reply.id}
              className="scroll-mt-12"
            >
              <ReplyNote
                event={reply}
                parentEventId={event.id !== parentEventHexId ? parentEventId : undefined}
                onClickParent={() => {
                  logger.debug('[ReplyNoteList] onClickParent called:', {
                    parentEventHexId: parentEventHexId?.substring(0, 8),
                    parentEventId: parentEventId?.substring(0, 8),
                    repliesCount: replies.length,
                    parentInReplies: !replies.every((r) => r.id !== parentEventHexId)
                  })
                  
                  if (!parentEventHexId) {
                    logger.debug('[ReplyNoteList] No parentEventHexId, returning early')
                    return
                  }
                  
                  // First, try to highlight the parent if it's already in the replies
                  if (!replies.every((r) => r.id !== parentEventHexId)) {
                    logger.debug('[ReplyNoteList] Parent found in replies, highlighting:', parentEventHexId.substring(0, 8))
                    highlightReply(parentEventHexId)
                    return
                  }
                  
                  // DEPRECATED: Double-panel logic removed - always expand thread to show parent
                  // Fetch and add the parent to the thread to expand the current thread
                  logger.debug('[ReplyNoteList] Fetching parent event to expand thread')
                  const fetchAndAddParent = async () => {
                    try {
                      logger.debug('[ReplyNoteList] Fetching parent event:', parentEventId ?? parentEventHexId)
                      const parentEvent = await client.fetchEvent(parentEventId ?? parentEventHexId)
                      if (parentEvent) {
                        logger.debug('[ReplyNoteList] Parent event fetched, adding to replies:', parentEvent.id.substring(0, 8))
                        addReplies([parentEvent])
                        // Highlight the parent after it's added
                        setTimeout(() => highlightReply(parentEvent.id), 100)
                      } else {
                        logger.debug('[ReplyNoteList] Parent event not found')
                      }
                    } catch (error) {
                      logger.debug('[ReplyNoteList] Failed to fetch parent event:', error)
                      // Fallback to navigation if fetch fails
                      navigateToNote(toNote(parentEventId ?? parentEventHexId))
                    }
                  }
                  fetchAndAddParent()
                }}
                highlight={highlightReplyId === reply.id}
              />
            </div>
          )
        })}
      </div>
      {!loading && (
        <div className="text-sm mt-2 mb-3 text-center text-muted-foreground">
          {replies.length > 0 ? t('no more replies') : t('no replies')}
        </div>
      )}
      <div ref={bottomRef} />
      {loading && <ReplyNoteSkeleton />}
    </div>
  )
}

export default ReplyNoteList
