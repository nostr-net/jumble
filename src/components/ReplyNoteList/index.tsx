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
import { toNote } from '@/lib/link'
import { generateBech32IdFromETag, tagNameEquals } from '@/lib/tag'
import { normalizeUrl } from '@/lib/url'
import { useSmartNoteNavigation, useSecondaryPage } from '@/PageManager'
import { useContentPolicy } from '@/providers/ContentPolicyProvider'
import { useMuteList } from '@/providers/MuteListProvider'
import { useNostr } from '@/providers/NostrProvider'
import { useReply } from '@/providers/ReplyProvider'
import { useUserTrust } from '@/providers/UserTrustProvider'
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

function ReplyNoteList({ index, event, sort = 'oldest' }: { index?: number; event: NEvent; sort?: 'newest' | 'oldest' | 'top' | 'controversial' | 'most-zapped' }) {
  const { t } = useTranslation()
  const { navigateToNote } = useSmartNoteNavigation()
  const { currentIndex } = useSecondaryPage()
  const { hideUntrustedInteractions, isUserTrusted } = useUserTrust()
  const { mutePubkeySet } = useMuteList()
  const { hideContentMentioningMutedUsers } = useContentPolicy()
  const { relayList: userRelayList } = useNostr()
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
    let parentEventKeys = [currentEventKey]
    if (isReplaceableEvent(event.kind) && currentEventKey !== eventIdKey) {
      parentEventKeys.push(eventIdKey)
    }

    
    while (parentEventKeys.length > 0) {
      const events = parentEventKeys.flatMap((id) => repliesMap.get(id)?.events || [])
      
      events.forEach((evt) => {
        if (replyIdSet.has(evt.id)) return
        if (mutePubkeySet.has(evt.pubkey)) {
          return
        }
        if (hideContentMentioningMutedUsers && isMentioningMutedUsers(evt, mutePubkeySet)) {
          return
        }

        replyIdSet.add(evt.id)
        replyEvents.push(evt)
      })
      parentEventKeys = events.map((evt) => evt.id)
    }
    


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
  const [timelineKey, setTimelineKey] = useState<string | undefined>(undefined)
  const [until, setUntil] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState<boolean>(false)
  const [showCount, setShowCount] = useState(SHOW_COUNT)
  const [highlightReplyId, setHighlightReplyId] = useState<string | undefined>(undefined)
  const replyRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const fetchRootEvent = async () => {
      let root: TRootInfo = isReplaceableEvent(event.kind)
        ? {
            type: 'A',
            id: getReplaceableCoordinateFromEvent(event),
            eventId: event.id,
            pubkey: event.pubkey,
            relay: client.getEventHint(event.id)
          }
        : { type: 'E', id: event.id, pubkey: event.pubkey }
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
    if (loading || !rootInfo || currentIndex !== index) return

        const init = async () => {
          setLoading(true)

          try {
            
            // Privacy: Only use user's own relays + defaults, never connect to other users' relays
            const userRelays = userRelayList?.read || []
            const finalRelayUrls = Array.from(new Set([
              ...FAST_READ_RELAY_URLS.map(url => normalizeUrl(url) || url), // Fast, well-connected relays
              ...userRelays.map(url => normalizeUrl(url) || url) // User's mailbox relays
            ]))
            

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
        } else {
          // Fetch replies for discussion threads (kind 11)
          filters.push({
            '#I': [rootInfo.id],
            kinds: [ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
            limit: LIMIT
          })
        }


        
        const { closer, timelineKey } = await client.subscribeTimeline(
          filters.map((filter) => ({
            urls: finalRelayUrls.slice(0, 8), // Increased from 5 to 8 for better coverage
            filter
          })),
          {
              onEvents: (evts, eosed) => {
                if (evts.length > 0) {
                  const regularReplies = evts.filter((evt) => isReplyNoteEvent(evt))
                  addReplies(regularReplies)
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
        setTimelineKey(timelineKey)
        return closer
      } catch {
        setLoading(false)
      }
      return
    }

    const promise = init()
    return () => {
      promise.then((closer) => closer?.())
    }
  }, [rootInfo, currentIndex, index, onNewReply])

  useEffect(() => {
    if (replies.length === 0) {
      loadMore()
    }
  }, [replies])

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
                  if (!parentEventHexId) return
                  if (replies.every((r) => r.id !== parentEventHexId)) {
                    navigateToNote(toNote(parentEventId ?? parentEventHexId))
                    return
                  }
                  highlightReply(parentEventHexId)
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
