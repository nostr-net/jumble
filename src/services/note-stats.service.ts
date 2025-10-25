import { BIG_RELAY_URLS, ExtendedKind } from '@/constants'
import { getReplaceableCoordinateFromEvent, isReplaceableEvent } from '@/lib/event'
import { getZapInfoFromEvent } from '@/lib/event-metadata'
import { getEmojiInfosFromEmojiTags, tagNameEquals } from '@/lib/tag'
import client from '@/services/client.service'
import { TEmoji } from '@/types'
import dayjs from 'dayjs'
import { Event, Filter, kinds } from 'nostr-tools'

export type TNoteStats = {
  likeIdSet: Set<string>
  likes: { id: string; pubkey: string; created_at: number; emoji: TEmoji | string }[]
  repostPubkeySet: Set<string>
  reposts: { id: string; pubkey: string; created_at: number }[]
  zapPrSet: Set<string>
  zaps: { pr: string; pubkey: string; amount: number; created_at: number; comment?: string }[]
  replyIdSet: Set<string>
  replies: { id: string; pubkey: string; created_at: number }[]
  quoteIdSet: Set<string>
  quotes: { id: string; pubkey: string; created_at: number }[]
  highlightIdSet: Set<string>
  highlights: { id: string; pubkey: string; created_at: number }[]
  updatedAt?: number
}

class NoteStatsService {
  static instance: NoteStatsService
  private noteStatsMap: Map<string, Partial<TNoteStats>> = new Map()
  private noteStatsSubscribers = new Map<string, Set<() => void>>()

  constructor() {
    if (!NoteStatsService.instance) {
      NoteStatsService.instance = this
    }
    return NoteStatsService.instance
  }

  async fetchNoteStats(event: Event, pubkey?: string | null) {
    const oldStats = this.noteStatsMap.get(event.id)
    let since: number | undefined
    if (oldStats?.updatedAt) {
      since = oldStats.updatedAt
    }
    // Privacy: Only use current user's relays + defaults, never connect to other users' relays
    const [relayList, authorProfile] = await Promise.all([
      pubkey ? client.fetchRelayList(pubkey) : Promise.resolve({ write: [], read: [] }),
      client.fetchProfile(event.pubkey)
    ])

    const replaceableCoordinate = isReplaceableEvent(event.kind)
      ? getReplaceableCoordinateFromEvent(event)
      : undefined

    const filters: Filter[] = [
      {
        '#e': [event.id],
        kinds: [kinds.Reaction],
        limit: 500
      },
      {
        '#e': [event.id],
        kinds: [kinds.Repost],
        limit: 100
      },
      {
        '#e': [event.id],
        kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
        limit: 500
      },
      {
        '#q': [event.id],
        kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
        limit: 500
      },
      {
        '#e': [event.id],
        kinds: [kinds.Highlights],
        limit: 500
      }
    ]

    if (replaceableCoordinate) {
      filters.push(
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.Reaction],
          limit: 500
        },
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.Repost],
          limit: 100
        },
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
          limit: 500
        },
        {
          '#q': [replaceableCoordinate],
          kinds: [kinds.ShortTextNote, ExtendedKind.COMMENT, ExtendedKind.VOICE_COMMENT],
          limit: 500
        },
        {
          '#a': [replaceableCoordinate],
          kinds: [kinds.Highlights],
          limit: 500
        }
      )
    }

    if (authorProfile?.lightningAddress) {
      filters.push({
        '#e': [event.id],
        kinds: [kinds.Zap],
        limit: 500
      })

      if (replaceableCoordinate) {
        filters.push({
          '#a': [replaceableCoordinate],
          kinds: [kinds.Zap],
          limit: 500
        })
      }
    }

    if (pubkey) {
      filters.push({
        '#e': [event.id],
        authors: [pubkey],
        kinds: [kinds.Reaction, kinds.Repost]
      })

      if (replaceableCoordinate) {
        filters.push({
          '#a': [replaceableCoordinate],
          authors: [pubkey],
          kinds: [kinds.Reaction, kinds.Repost]
        })
      }

      if (authorProfile?.lightningAddress) {
        filters.push({
          '#e': [event.id],
          '#P': [pubkey],
          kinds: [kinds.Zap]
        })

        if (replaceableCoordinate) {
          filters.push({
            '#a': [replaceableCoordinate],
            '#P': [pubkey],
            kinds: [kinds.Zap]
          })
        }
      }
    }

    if (since) {
      filters.forEach((filter) => {
        filter.since = since
      })
    }
    const events: Event[] = []
    await client.fetchEvents([...relayList.read, ...BIG_RELAY_URLS].slice(0, 5), filters, {
      onevent: (evt) => {
        this.updateNoteStatsByEvents([evt])
        events.push(evt)
      }
    })
    this.noteStatsMap.set(event.id, {
      ...(this.noteStatsMap.get(event.id) ?? {}),
      updatedAt: dayjs().unix()
    })
    return this.noteStatsMap.get(event.id) ?? {}
  }

  subscribeNoteStats(noteId: string, callback: () => void) {
    let set = this.noteStatsSubscribers.get(noteId)
    if (!set) {
      set = new Set()
      this.noteStatsSubscribers.set(noteId, set)
    }
    set.add(callback)
    return () => {
      set?.delete(callback)
      if (set?.size === 0) this.noteStatsSubscribers.delete(noteId)
    }
  }

  private notifyNoteStats(noteId: string) {
    const set = this.noteStatsSubscribers.get(noteId)
    if (set) {
      set.forEach((cb) => cb())
    }
  }

  getNoteStats(id: string): Partial<TNoteStats> | undefined {
    return this.noteStatsMap.get(id)
  }

  addZap(
    pubkey: string,
    eventId: string,
    pr: string,
    amount: number,
    comment?: string,
    created_at: number = dayjs().unix(),
    notify: boolean = true
  ) {
    const old = this.noteStatsMap.get(eventId) || {}
    const zapPrSet = old.zapPrSet || new Set()
    const zaps = old.zaps || []
    if (zapPrSet.has(pr)) return

    zapPrSet.add(pr)
    zaps.push({ pr, pubkey, amount, comment, created_at })
    this.noteStatsMap.set(eventId, { ...old, zapPrSet, zaps })
    if (notify) {
      this.notifyNoteStats(eventId)
    }
    return eventId
  }

  updateNoteStatsByEvents(events: Event[]) {
    const updatedEventIdSet = new Set<string>()
    events.forEach((evt) => {
      let updatedEventId: string | undefined
      if (evt.kind === kinds.Reaction) {
        updatedEventId = this.addLikeByEvent(evt)
      } else if (evt.kind === kinds.Repost) {
        updatedEventId = this.addRepostByEvent(evt)
      } else if (evt.kind === kinds.Zap) {
        updatedEventId = this.addZapByEvent(evt)
      } else if (evt.kind === kinds.ShortTextNote || evt.kind === ExtendedKind.COMMENT || evt.kind === ExtendedKind.VOICE_COMMENT) {
        // Check if it's a reply or quote
        const isQuote = this.isQuoteByEvent(evt)
        if (isQuote) {
          updatedEventId = this.addQuoteByEvent(evt)
        } else {
          updatedEventId = this.addReplyByEvent(evt)
        }
      } else if (evt.kind === kinds.Highlights) {
        updatedEventId = this.addHighlightByEvent(evt)
      }
      if (updatedEventId) {
        updatedEventIdSet.add(updatedEventId)
      }
    })
    updatedEventIdSet.forEach((eventId) => {
      this.notifyNoteStats(eventId)
    })
  }

  private addLikeByEvent(evt: Event) {
    const targetEventId = evt.tags.findLast(tagNameEquals('e'))?.[1]
    if (!targetEventId) return

    const old = this.noteStatsMap.get(targetEventId) || {}
    const likeIdSet = old.likeIdSet || new Set()
    const likes = old.likes || []
    if (likeIdSet.has(evt.id)) return

    let emoji: TEmoji | string = evt.content.trim()
    if (!emoji) return

    if (emoji.startsWith(':') && emoji.endsWith(':')) {
      const emojiInfos = getEmojiInfosFromEmojiTags(evt.tags)
      const shortcode = emoji.split(':')[1]
      const emojiInfo = emojiInfos.find((info) => info.shortcode === shortcode)
      if (emojiInfo) {
        emoji = emojiInfo
      } else {
        emoji = '+'
      }
    }

    likeIdSet.add(evt.id)
    likes.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at, emoji })
    this.noteStatsMap.set(targetEventId, { ...old, likeIdSet, likes })
    return targetEventId
  }

  removeLike(eventId: string, reactionEventId: string) {
    const old = this.noteStatsMap.get(eventId) || {}
    const likeIdSet = old.likeIdSet || new Set()
    const likes = old.likes || []
    
    if (!likeIdSet.has(reactionEventId)) return eventId

    likeIdSet.delete(reactionEventId)
    const newLikes = likes.filter(like => like.id !== reactionEventId)
    this.noteStatsMap.set(eventId, { ...old, likeIdSet, likes: newLikes })
    this.notifyNoteStats(eventId)
    return eventId
  }

  private addRepostByEvent(evt: Event) {
    const eventId = evt.tags.find(tagNameEquals('e'))?.[1]
    if (!eventId) return

    const old = this.noteStatsMap.get(eventId) || {}
    const repostPubkeySet = old.repostPubkeySet || new Set()
    const reposts = old.reposts || []
    if (repostPubkeySet.has(evt.pubkey)) return

    repostPubkeySet.add(evt.pubkey)
    reposts.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(eventId, { ...old, repostPubkeySet, reposts })
    return eventId
  }

  private addZapByEvent(evt: Event) {
    const info = getZapInfoFromEvent(evt)
    if (!info) return
    const { originalEventId, senderPubkey, invoice, amount, comment } = info
    if (!originalEventId || !senderPubkey) return

    return this.addZap(
      senderPubkey,
      originalEventId,
      invoice,
      amount,
      comment,
      evt.created_at,
      false
    )
  }

  private addReplyByEvent(evt: Event) {
    // Use the same logic as isReplyNoteEvent to identify replies
    let originalEventId: string | undefined

    // For kind 1111 and 1244, always consider them replies and look for parent event
    if (evt.kind === ExtendedKind.COMMENT || evt.kind === ExtendedKind.VOICE_COMMENT) {
      const eTag = evt.tags.find(tagNameEquals('e')) ?? evt.tags.find(tagNameEquals('E'))
      originalEventId = eTag?.[1]
    }
    // For kind 1 (ShortTextNote), check if it's actually a reply
    else if (evt.kind === kinds.ShortTextNote) {
      // Check for parent E tag (reply or root marker)
      const parentETag = evt.tags.find(([tagName, , , marker]) => {
        return tagName === 'e' && (marker === 'reply' || marker === 'root')
      })
      if (parentETag) {
        originalEventId = parentETag[1]
      } else {
        // Look for the last E tag that's not a mention
        const embeddedEventIds = this.getEmbeddedNoteBech32Ids(evt)
        const lastETag = evt.tags.findLast(
          ([tagName, tagValue, , marker]) =>
            tagName === 'e' &&
            !!tagValue &&
            marker !== 'mention' &&
            !embeddedEventIds.includes(tagValue)
        )
        originalEventId = lastETag?.[1]
      }
      
      // Also check for parent A tag
      if (!originalEventId) {
        const aTag = evt.tags.find(tagNameEquals('a'))
        originalEventId = aTag?.[1]
      }
    }

    if (!originalEventId) return

    const old = this.noteStatsMap.get(originalEventId) || {}
    const replyIdSet = old.replyIdSet || new Set()
    const replies = old.replies || []

    if (replyIdSet.has(evt.id)) return

    replyIdSet.add(evt.id)
    replies.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(originalEventId, { ...old, replyIdSet, replies })
    return originalEventId
  }

  private isQuoteByEvent(evt: Event): boolean {
    // A quote has a 'q' tag (quoted event)
    return evt.tags.some(tag => tag[0] === 'q' && tag[1])
  }

  private addQuoteByEvent(evt: Event) {
    // Find the quoted event ID from 'q' tag
    const quotedEventId = evt.tags.find(tag => tag[0] === 'q')?.[1]
    if (!quotedEventId) return

    const old = this.noteStatsMap.get(quotedEventId) || {}
    const quoteIdSet = old.quoteIdSet || new Set()
    const quotes = old.quotes || []

    if (quoteIdSet.has(evt.id)) return

    quoteIdSet.add(evt.id)
    quotes.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(quotedEventId, { ...old, quoteIdSet, quotes })
    return quotedEventId
  }

  private addHighlightByEvent(evt: Event) {
    // Find the event ID from 'e' tag
    const highlightedEventId = evt.tags.find(tag => tag[0] === 'e')?.[1]
    if (!highlightedEventId) return

    const old = this.noteStatsMap.get(highlightedEventId) || {}
    const highlightIdSet = old.highlightIdSet || new Set()
    const highlights = old.highlights || []

    if (highlightIdSet.has(evt.id)) return

    highlightIdSet.add(evt.id)
    highlights.push({ id: evt.id, pubkey: evt.pubkey, created_at: evt.created_at })
    this.noteStatsMap.set(highlightedEventId, { ...old, highlightIdSet, highlights })
    return highlightedEventId
  }

  private getEmbeddedNoteBech32Ids(event: Event): string[] {
    // Simple implementation - in practice, this should match the logic in lib/event.ts
    const embeddedIds: string[] = []
    const content = event.content || ''
    const matches = content.match(/nostr:(note1|nevent1)[a-zA-Z0-9]+/g)
    if (matches) {
      matches.forEach(match => {
        const id = match.replace('nostr:', '')
        embeddedIds.push(id)
      })
    }
    return embeddedIds
  }
}

const instance = new NoteStatsService()

export default instance
