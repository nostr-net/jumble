import { BIG_RELAY_URLS, DEFAULT_FAVORITE_RELAYS, ExtendedKind, FAST_READ_RELAY_URLS, FAST_WRITE_RELAY_URLS, PROFILE_FETCH_RELAY_URLS, PROFILE_RELAY_URLS, SEARCHABLE_RELAY_URLS } from '@/constants'
import {
  compareEvents,
  getReplaceableCoordinate,
  getReplaceableCoordinateFromEvent,
  isReplaceableEvent
} from '@/lib/event'
import { getProfileFromEvent, getRelayListFromEvent } from '@/lib/event-metadata'
import logger from '@/lib/logger'
import { formatPubkey, isValidPubkey, pubkeyToNpub, userIdToPubkey } from '@/lib/pubkey'
import { getPubkeysFromPTags, getServersFromServerTags } from '@/lib/tag'
import { isWebsocketUrl, normalizeUrl } from '@/lib/url'
import { isSafari } from '@/lib/utils'
import storage from '@/services/local-storage.service'
import { ISigner, TProfile, TPublishOptions, TRelayList, TSubRequestFilter } from '@/types'
import { sha256 } from '@noble/hashes/sha256'
import DataLoader from 'dataloader'
import dayjs from 'dayjs'
import FlexSearch from 'flexsearch'
import { LRUCache } from 'lru-cache'
import {
  EventTemplate,
  Filter,
  kinds,
  Event as NEvent,
  nip19,
  SimplePool,
  VerifiedEvent
} from 'nostr-tools'
import { AbstractRelay } from 'nostr-tools/abstract-relay'
import indexedDb from './indexed-db.service'

type TTimelineRef = [string, number]

class ClientService extends EventTarget {
  static instance: ClientService

  signer?: ISigner
  pubkey?: string
  private pool: SimplePool

  private timelines: Record<
    string,
    | {
        refs: TTimelineRef[]
        filter: TSubRequestFilter
        urls: string[]
      }
    | string[]
    | undefined
  > = {}
  private replaceableEventCacheMap = new Map<string, NEvent>()
  private eventCacheMap = new Map<string, Promise<NEvent | undefined>>()
  private eventDataLoader = new DataLoader<string, NEvent | undefined>(
    (ids) => Promise.all(ids.map((id) => this._fetchEvent(id))),
    { cacheMap: this.eventCacheMap }
  )
  private requestThrottle = new Map<string, number>() // Track request timestamps per relay
  private readonly REQUEST_COOLDOWN = 3000 // 3 second cooldown between requests to prevent "too many REQs"
  private failureCount = new Map<string, number>() // Track consecutive failures per relay
  private readonly MAX_FAILURES = 1 // Max failures before exponential backoff (reduced to 1 for faster circuit breaker activation)
  private circuitBreaker = new Map<string, number>() // Track when relays are temporarily disabled
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000 // 60 second timeout for circuit breaker (increased for better stability)
  private concurrentRequests = new Map<string, number>() // Track concurrent requests per relay
  private readonly MAX_CONCURRENT_REQUESTS = 1 // Max concurrent requests per relay (reduced to prevent "too many REQs")
  private globalRequestThrottle = 0 // Global request throttle to prevent overwhelming all relays
  private readonly GLOBAL_REQUEST_COOLDOWN = 1000 // 1 second global cooldown between any relay requests
  private blacklistedRelays = new Map<string, number>() // Temporarily blacklist problematic relays
  private readonly BLACKLIST_TIMEOUT = 300000 // 5 minutes blacklist timeout

  private userIndex = new FlexSearch.Index({
    tokenize: 'forward'
  })

  constructor() {
    super()
    this.pool = new SimplePool()
    this.pool.trackRelays = true
  }

  public static getInstance(): ClientService {
    if (!ClientService.instance) {
      ClientService.instance = new ClientService()
      ClientService.instance.init()
    }
    return ClientService.instance
  }

  async init() {
    await indexedDb.iterateProfileEvents((profileEvent) => this.addUsernameToIndex(profileEvent))
  }

  async determineTargetRelays(
    event: NEvent,
    { specifiedRelayUrls, additionalRelayUrls }: TPublishOptions = {}
  ) {
    let relays: string[]
    
    // Check if this is a discussion thread or reply to a discussion
    const isDiscussionRelated = event.kind === ExtendedKind.DISCUSSION || 
      event.tags.some(tag => tag[0] === 'k' && tag[1] === String(ExtendedKind.DISCUSSION))
    
    // Special handling for discussion-related events: try specified relay first, then fallback
    if (specifiedRelayUrls?.length && (event.kind === ExtendedKind.DISCUSSION || event.kind === ExtendedKind.COMMENT)) {
      // For discussion replies, try ONLY the specified relay first
      // The fallback will be handled in the publishing logic if this fails
      // But still filter blocked relays from specified relays
      if (this.pubkey) {
        const blockedRelays = await this.fetchBlockedRelays(this.pubkey)
        relays = this.filterBlockedRelays(specifiedRelayUrls, blockedRelays)
      } else {
        relays = specifiedRelayUrls
      }
      return relays
    } else if (specifiedRelayUrls?.length) {
      // For non-discussion events, use specified relays (will be filtered below)
      relays = specifiedRelayUrls
    } else {
      const _additionalRelayUrls: string[] = additionalRelayUrls ?? []
      
      // Publish to mentioned users' inboxes for all events EXCEPT discussions
      if (!isDiscussionRelated) {
        const mentions: string[] = []
        event.tags.forEach(([tagName, tagValue]) => {
          if (
            ['p', 'P'].includes(tagName) &&
            !!tagValue &&
            isValidPubkey(tagValue) &&
            !mentions.includes(tagValue)
          ) {
            mentions.push(tagValue)
          }
        })
        if (mentions.length > 0) {
          const relayLists = await this.fetchRelayLists(mentions)
          relayLists.forEach((relayList) => {
            _additionalRelayUrls.push(...relayList.read.slice(0, 4))
          })
        }
      }
      
      if (
        [
          kinds.RelayList,
          kinds.Contacts,
          ExtendedKind.FAVORITE_RELAYS,
          ExtendedKind.BLOSSOM_SERVER_LIST,
          ExtendedKind.RELAY_REVIEW,
          ExtendedKind.BLOCKED_RELAYS,
          kinds.Pinlist,
          kinds.Mutelist,
          kinds.BookmarkList,
          kinds.InterestsList,
          ExtendedKind.FAVORITE_RELAYS,
        ].includes(event.kind)
      ) {
        _additionalRelayUrls.push(...PROFILE_RELAY_URLS, ...FAST_WRITE_RELAY_URLS)
      }

      // Use current user's relay list
      const relayList = this.pubkey ? await this.fetchRelayList(this.pubkey) : { write: [], read: [] }
      const senderWriteRelays = relayList?.write.slice(0, 6) ?? []
      const recipientReadRelays = Array.from(new Set(_additionalRelayUrls))
      // Normalize and deduplicate the combined relay list
      const normalizedSenderRelays = senderWriteRelays.map(url => normalizeUrl(url) || url)
      const normalizedRecipientRelays = recipientReadRelays.map(url => normalizeUrl(url) || url)
      relays = Array.from(new Set(normalizedSenderRelays.concat(normalizedRecipientRelays)))
    }
 
    if (!relays.length) {
      relays.push(...FAST_WRITE_RELAY_URLS)
    }

    // Filter out blocked relays
    if (this.pubkey) {
      const blockedRelays = await this.fetchBlockedRelays(this.pubkey)
      relays = this.filterBlockedRelays(relays, blockedRelays)
    }

    return relays
  }

  async publishEvent(relayUrls: string[], event: NEvent, options: { disableFallbacks?: boolean } = {}): Promise<{
    success: boolean
    relayStatuses: Array<{
      url: string
      success: boolean
      error?: string
      authAttempted?: boolean
    }>
    successCount: number
    totalCount: number
  }> {
    // Special handling for discussion events: try relay hint first, then fallback
    // BUT: if disableFallbacks is true (user explicitly selected relays), don't use fallbacks
    if ((event.kind === ExtendedKind.DISCUSSION || event.kind === ExtendedKind.COMMENT) && relayUrls.length === 1 && !options.disableFallbacks) {
      try {
        // Try publishing to the relay hint first
        const result = await this._publishToRelays(relayUrls, event)
        
        // If successful, return the result
        if (result.success) {
          return result
        }
        
        // If failed, try fallback relays (filtering out blocked relays)
        const userRelays = this.pubkey ? await this.fetchRelayList(this.pubkey) : { write: [], read: [] }
        const blockedRelays = this.pubkey ? await this.fetchBlockedRelays(this.pubkey) : []
        let fallbackRelays = userRelays.write.length > 0 ? userRelays.write.slice(0, 3) : FAST_WRITE_RELAY_URLS
        fallbackRelays = this.filterBlockedRelays(fallbackRelays, blockedRelays)
        
        logger.debug('Relay hint failed, trying fallback relays:', fallbackRelays)
        const fallbackResult = await this._publishToRelays(fallbackRelays, event)
        
        // Combine relay statuses from both attempts
        const combinedRelayStatuses = [...result.relayStatuses, ...fallbackResult.relayStatuses]
        const combinedSuccessCount = combinedRelayStatuses.filter(s => s.success).length
        
        return {
          success: combinedSuccessCount > 0,
          relayStatuses: combinedRelayStatuses,
          successCount: combinedSuccessCount,
          totalCount: combinedRelayStatuses.length
        }
      } catch (error) {
        // If relay hint throws an error, try fallback relays
        logger.debug('Relay hint threw error, trying fallback relays:', error)
        
        // Extract relay statuses from the error if available
        let hintRelayStatuses: any[] = []
        if (error instanceof AggregateError && (error as any).relayStatuses) {
          hintRelayStatuses = (error as any).relayStatuses
        }
        
        const userRelays = this.pubkey ? await this.fetchRelayList(this.pubkey) : { write: [], read: [] }
        const blockedRelays = this.pubkey ? await this.fetchBlockedRelays(this.pubkey) : []
        let fallbackRelays = userRelays.write.length > 0 ? userRelays.write.slice(0, 3) : FAST_WRITE_RELAY_URLS
        fallbackRelays = this.filterBlockedRelays(fallbackRelays, blockedRelays)
        
        logger.debug('Trying fallback relays:', fallbackRelays)
        const fallbackResult = await this._publishToRelays(fallbackRelays, event)
        
        // Combine relay statuses from both attempts
        const combinedRelayStatuses = [...hintRelayStatuses, ...fallbackResult.relayStatuses]
        const combinedSuccessCount = combinedRelayStatuses.filter(s => s.success).length
        
        return {
          success: combinedSuccessCount > 0,
          relayStatuses: combinedRelayStatuses,
          successCount: combinedSuccessCount,
          totalCount: combinedRelayStatuses.length
        }
      }
    }
    
    // For non-discussion events, use normal publishing
    return await this._publishToRelays(relayUrls, event)
  }

  private async _publishToRelays(relayUrls: string[], event: NEvent): Promise<{
    success: boolean
    relayStatuses: Array<{
      url: string
      success: boolean
      error?: string
      authAttempted?: boolean
    }>
    successCount: number
    totalCount: number
  }> {
    const uniqueRelayUrls = this.optimizeRelaySelection(Array.from(new Set(relayUrls)))
    
    // Handle case where no relays are available (all filtered out)
    if (uniqueRelayUrls.length === 0) {
      const error = new Error('No relays available for publishing - all relays may be blocked or unavailable')
      ;(error as any).relayStatuses = []
      throw error
    }
    
    const relayStatuses: Array<{
      url: string
      success: boolean
      error?: string
      authAttempted?: boolean
    }> = []
    
    const result = await new Promise<{
      success: boolean
      relayStatuses: typeof relayStatuses
      successCount: number
      totalCount: number
    }>((resolve, reject) => {
      let successCount = 0
      let finishedCount = 0
      const errors: { url: string; error: any }[] = []
      let resolved = false
      
      const checkCompletion = () => {
        if (resolved) return
        
        // Wait for all relays to complete before resolving (don't complete early)
        // This ensures we show the full relay status information
        if (finishedCount >= uniqueRelayUrls.length && !resolved) {
          const isSuccess = successCount > 0
          if (isSuccess) {
            this.emitNewEvent(event)
          }
          resolved = true
          resolve({
            success: isSuccess,
            relayStatuses,
            successCount,
            totalCount: uniqueRelayUrls.length
          })
          return
        }
        
        // Handle case where no relays succeed
        if (finishedCount >= uniqueRelayUrls.length && !resolved && successCount === 0) {
          resolved = true
          const aggregateError = new AggregateError(
            errors.map(
              ({ url, error }) => {
                let errorMsg = 'Unknown error'
                if (error instanceof Error) {
                  errorMsg = error.message || 'Empty error message'
                } else if (error !== null && error !== undefined) {
                  errorMsg = String(error)
                }
                return new Error(`Failed to publish to ${url}: ${errorMsg}`)
              }
            )
          )
          // Attach relay statuses to the error so they can be displayed
          ;(aggregateError as any).relayStatuses = relayStatuses
          reject(aggregateError)
        }
      }
      
      // Add overall timeout to prevent hanging
      const overallTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          if (successCount > 0) {
            this.emitNewEvent(event)
            resolve({
              success: true,
              relayStatuses,
              successCount,
              totalCount: uniqueRelayUrls.length
            })
          } else {
            // Don't reject for notification updates - they're not critical
            if (event.kind === 30078) { // Application-specific data (notifications)
              logger.debug('Notification update timeout - non-critical, continuing')
              resolve({
                success: false,
                relayStatuses,
                successCount: 0,
                totalCount: uniqueRelayUrls.length
              })
            } else {
              reject(new Error('Publishing timeout - no relays responded in time'))
            }
          }
        }
      }, 10_000) // Reduced to 10 second overall timeout
      
      Promise.allSettled(
        uniqueRelayUrls.map(async (url) => {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const that = this
          
           try {
            // Throttle requests to prevent "too many concurrent REQs" errors
            await this.throttleRequest(url)
            
            const relay = await this.pool.ensureRelay(url)
            relay.publishTimeout = 8_000 // 8s
            
            await relay.publish(event)
            this.trackEventSeenOn(event.id, relay)
            this.recordSuccess(url)
            successCount++
            finishedCount++
            
            relayStatuses.push({
              url,
              success: true
            })
            
            checkCompletion()
          } catch (error) {
            let errorMessage = 'Unknown error'
            if (error instanceof Error) {
              errorMessage = error.message || 'Empty error message'
            } else if (error !== null && error !== undefined) {
              errorMessage = String(error)
            }
            
            // Record failure for exponential backoff
            this.recordFailure(url)
            
            // Check if this is a "too many concurrent REQs" error
            if (
              error instanceof Error &&
              error.message.includes('too many concurrent REQs')
            ) {
              logger.debug(`⚠ Relay ${url} is overloaded, blacklisting temporarily`)
              // Blacklist this relay for 5 minutes to prevent further overload
              this.blacklistRelay(url)
              errors.push({ url, error: new Error('Relay overloaded - too many concurrent requests') })
              finishedCount++
              
              relayStatuses.push({
                url,
                success: false,
                error: 'Relay overloaded - too many concurrent requests'
              })
              
              checkCompletion()
              return
            }
            
            // Check if this is an auth-required error and we have a signer
            if (
              error instanceof Error &&
              error.message.startsWith('auth-required') &&
              !!that.signer
            ) {
              try {
                // Throttle auth requests too
                await this.throttleRequest(url)
                
                const relay = await this.pool.ensureRelay(url)
                
                const authPromise = relay.auth((authEvt: EventTemplate) => {
                  // Ensure the auth event has the correct pubkey
                  const authEventWithPubkey = { ...authEvt, pubkey: that.pubkey }
                  return that.signer!.signEvent(authEventWithPubkey)
                })
                
                const authTimeoutPromise = new Promise((_, reject) => {
                  setTimeout(() => reject(new Error('Auth timeout')), 8000) // 8s timeout
                })
                
                await Promise.race([authPromise, authTimeoutPromise])
                
                await relay.publish(event)
                this.trackEventSeenOn(event.id, relay)
                this.recordSuccess(url)
                successCount++
                finishedCount++
                
                relayStatuses.push({
                  url,
                  success: true,
                  authAttempted: true
                })
                
                checkCompletion()
              } catch (authError) {
                let authErrorMessage = 'Unknown auth error'
                if (authError instanceof Error) {
                  authErrorMessage = authError.message || 'Empty auth error message'
                } else if (authError !== null && authError !== undefined) {
                  authErrorMessage = String(authError)
                }
                this.recordFailure(url)
                errors.push({ url, error: authError })
                finishedCount++
                
                relayStatuses.push({
                  url,
                  success: false,
                  error: authErrorMessage,
                  authAttempted: true
                })
                
                checkCompletion()
              }
            } else {
              // For permanent errors like "blocked" or "writes disabled", don't retry
              errors.push({ url, error })
              finishedCount++
              
              relayStatuses.push({
                url,
                success: false,
                error: errorMessage
              })
              
              checkCompletion()
            }
          }
        })
      ).finally(() => {
        clearTimeout(overallTimeout)
      })
    })
    
    return result
  }

  emitNewEvent(event: NEvent) {
    this.dispatchEvent(new CustomEvent('newEvent', { detail: event }))
  }

  async signHttpAuth(url: string, method: string, description = '') {
    if (!this.signer) {
      throw new Error('Please login first to sign the event')
    }
    const event = await this.signer?.signEvent({
      content: description,
      kind: kinds.HTTPAuth,
      created_at: dayjs().unix(),
      tags: [
        ['u', url],
        ['method', method]
      ]
    })
    return 'Nostr ' + btoa(JSON.stringify(event))
  }

  /** =========== Timeline =========== */

  private generateTimelineKey(urls: string[], filter: Filter) {
    const stableFilter: any = {}
    Object.entries(filter)
      .sort()
      .forEach(([key, value]) => {
        if (Array.isArray(value)) {
          stableFilter[key] = [...value].sort()
        }
        stableFilter[key] = value
      })
    const paramsStr = JSON.stringify({
      urls: [...urls].sort(),
      filter: stableFilter
    })
    const encoder = new TextEncoder()
    const data = encoder.encode(paramsStr)
    const hashBuffer = sha256(data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  private generateMultipleTimelinesKey(subRequests: { urls: string[]; filter: Filter }[]) {
    const keys = subRequests.map(({ urls, filter }) => this.generateTimelineKey(urls, filter))
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(keys.sort()))
    const hashBuffer = sha256(data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  async subscribeTimeline(
    subRequests: { urls: string[]; filter: TSubRequestFilter }[],
    {
      onEvents,
      onNew,
      onClose
    }: {
      onEvents: (events: NEvent[], eosed: boolean) => void
      onNew: (evt: NEvent) => void
      onClose?: (url: string, reason: string) => void
    },
    {
      startLogin,
      needSort = true
    }: {
      startLogin?: () => void
      needSort?: boolean
    } = {}
  ) {
    const newEventIdSet = new Set<string>()
    const requestCount = subRequests.length
    // More aggressive threshold for faster loading - respond when 1/2 of relays respond (increased from 1/3)
    const threshold = Math.max(1, Math.floor(requestCount / 2))
    let eventIdSet = new Set<string>()
    let events: NEvent[] = []
    let eosedCount = 0
    let hasCalledOnEvents = false

    // Add a global timeout for the entire subscription process
    const globalTimeout = setTimeout(() => {
      if (!hasCalledOnEvents && events.length === 0) {
        hasCalledOnEvents = true
        onEvents([], true) // Call with empty events to stop loading
        logger.debug('Global subscription timeout - stopping after 12 seconds')
      }
    }, 12000) // Increased timeout to 12 seconds for better reliability
    
    const subs = await Promise.all(
      subRequests.map(async ({ urls, filter }) => {
        // Throttle subscription requests to prevent overload
        for (const url of urls) {
          await this.throttleRequest(url)
        }
        
        return this._subscribeTimeline(
          urls,
          filter,
          {
            onEvents: (_events, _eosed) => {
              if (_eosed) {
                eosedCount++
              }

              _events.forEach((evt) => {
                if (eventIdSet.has(evt.id)) return
                eventIdSet.add(evt.id)
                events.push(evt)
              })
              events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
              eventIdSet = new Set(events.map((evt) => evt.id))

              // Call immediately on first events, then on threshold/completion
              if (!hasCalledOnEvents && events.length > 0) {
                hasCalledOnEvents = true
                clearTimeout(globalTimeout)
                onEvents(events, eosedCount >= requestCount)
              } else if (eosedCount >= threshold) {
                clearTimeout(globalTimeout)
                onEvents(events, eosedCount >= requestCount)
              }
            },
            onNew: (evt) => {
              if (newEventIdSet.has(evt.id)) return
              newEventIdSet.add(evt.id)
              onNew(evt)
            },
            onClose
          },
          { startLogin, needSort }
        )
      })
    )

    const key = this.generateMultipleTimelinesKey(subRequests)
    this.timelines[key] = subs.map((sub) => sub.timelineKey)

    return {
      closer: () => {
        clearTimeout(globalTimeout)
        onEvents = () => {}
        onNew = () => {}
        subs.forEach((sub) => {
          sub.closer()
        })
      },
      timelineKey: key
    }
  }

  async loadMoreTimeline(key: string, until: number, limit: number) {
    const timeline = this.timelines[key]
    if (!timeline) return []

    if (!Array.isArray(timeline)) {
      return this._loadMoreTimeline(key, until, limit)
    }
    const timelines = await Promise.all(
      timeline.map((key) => this._loadMoreTimeline(key, until, limit))
    )

    const eventIdSet = new Set<string>()
    const events: NEvent[] = []
    timelines.forEach((timeline) => {
      timeline.forEach((evt) => {
        if (eventIdSet.has(evt.id)) return
        eventIdSet.add(evt.id)
        events.push(evt)
      })
    })
    return events.sort((a, b) => b.created_at - a.created_at).slice(0, limit)
  }

  subscribe(
    urls: string[],
    filter: Filter | Filter[],
    {
      onevent,
      oneose,
      onclose,
      startLogin,
      onAllClose
    }: {
      onevent?: (evt: NEvent) => void
      oneose?: (eosed: boolean) => void
      onclose?: (url: string, reason: string) => void
      startLogin?: () => void
      onAllClose?: (reasons: string[]) => void
    }
  ) {
    const relays = this.optimizeRelaySelection(Array.from(new Set(urls)))
    const filters = Array.isArray(filter) ? filter : [filter]

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    const _knownIds = new Set<string>()
    let startedCount = 0
    let eosedCount = 0
    let eosed = false
    let closedCount = 0
    const closeReasons: string[] = []
    const subPromises: Promise<{ close: () => void }>[] = []
    relays.forEach((url) => {
      let hasAuthed = false

      subPromises.push(startSub())

      async function startSub() {
        startedCount++
        const relay = await that.pool.ensureRelay(url, { connectionTimeout: 3000 }).catch(() => {
          return undefined
        })
        // cannot connect to relay
        if (!relay) {
          if (!eosed) {
            eosedCount++
            eosed = eosedCount >= startedCount
            oneose?.(eosed)
          }
          return {
            close: () => {}
          }
        }

        return relay.subscribe(filters, {
          receivedEvent: (relay, id) => {
            that.trackEventSeenOn(id, relay)
          },
          alreadyHaveEvent: (id: string) => {
            const have = _knownIds.has(id)
            if (have) {
              return true
            }
            _knownIds.add(id)
            return false
          },
          onevent: (evt: NEvent) => {
            onevent?.(evt)
          },
          oneose: () => {
            // make sure eosed is not called multiple times
            if (eosed) return

            eosedCount++
            eosed = eosedCount >= startedCount
            oneose?.(eosed)
          },
          onclose: (reason: string) => {
            // auth-required
            if (reason.startsWith('auth-required') && !hasAuthed) {
              // already logged in
              if (that.signer) {
                relay
                  .auth(async (authEvt: EventTemplate) => {
                    const evt = await that.signer!.signEvent(authEvt)
                    if (!evt) {
                      throw new Error('sign event failed')
                    }
                    return evt as VerifiedEvent
                  })
                  .then(() => {
                    hasAuthed = true
                    if (!eosed) {
                      subPromises.push(startSub())
                    }
                  })
                  .catch(() => {
                    // ignore
                  })
                return
              }

              // open login dialog
              if (startLogin) {
                startLogin()
                return
              }
            }

            // close the subscription
            closedCount++
            closeReasons.push(reason)
            onclose?.(url, reason)
            if (closedCount >= startedCount) {
              onAllClose?.(closeReasons)
            }
            return
          },
          eoseTimeout: 5_000 // 5s (reduced from 8s)
        })
      }
    })

    return {
      close: () => {
        subPromises.forEach((subPromise) => {
          subPromise
            .then((sub) => {
              sub.close()
            })
            .catch((err) => {
              console.error(err)
            })
        })
      }
    }
  }

  private async _subscribeTimeline(
    urls: string[],
    filter: TSubRequestFilter, // filter with limit,
    {
      onEvents,
      onNew,
      onClose
    }: {
      onEvents: (events: NEvent[], eosed: boolean) => void
      onNew: (evt: NEvent) => void
      onClose?: (url: string, reason: string) => void
    },
    {
      startLogin,
      needSort = true
    }: {
      startLogin?: () => void
      needSort?: boolean
    } = {}
  ) {
    const relays = Array.from(new Set(urls))
    const key = this.generateTimelineKey(relays, filter)
    const timeline = this.timelines[key]
    let cachedEvents: NEvent[] = []
    let since: number | undefined
    if (timeline && !Array.isArray(timeline) && timeline.refs.length && needSort) {
      cachedEvents = (
        await this.eventDataLoader.loadMany(timeline.refs.slice(0, filter.limit).map(([id]) => id))
      ).filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[]
      if (cachedEvents.length) {
        onEvents([...cachedEvents], false)
        since = cachedEvents[0].created_at + 1
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const that = this
    let events: NEvent[] = []
    let eosedAt: number | null = null
    const subCloser = this.subscribe(relays, since ? { ...filter, since } : filter, {
      startLogin,
      onevent: (evt: NEvent) => {
        that.addEventToCache(evt)
        // not eosed yet, push to events
        if (!eosedAt) {
          return events.push(evt)
        }
        // new event
        if (evt.created_at > eosedAt) {
          onNew(evt)
        }

        const timeline = that.timelines[key]
        if (!timeline || Array.isArray(timeline) || !timeline.refs.length) {
          return
        }

        // find the right position to insert
        let idx = 0
        for (const ref of timeline.refs) {
          if (evt.created_at > ref[1] || (evt.created_at === ref[1] && evt.id < ref[0])) {
            break
          }
          // the event is already in the cache
          if (evt.created_at === ref[1] && evt.id === ref[0]) {
            return
          }
          idx++
        }
        // the event is too old, ignore it
        if (idx >= timeline.refs.length) return

        // insert the event to the right position
        timeline.refs.splice(idx, 0, [evt.id, evt.created_at])
      },
      oneose: (eosed) => {
        if (eosed && !eosedAt) {
          eosedAt = dayjs().unix()
        }
        // (algo feeds) no need to sort and cache
        if (!needSort) {
          return onEvents([...events], !!eosedAt)
        }
        if (!eosed) {
          events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
          return onEvents([...events.concat(cachedEvents).slice(0, filter.limit)], false)
        }

        events = events.sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit)
        const timeline = that.timelines[key]
        // no cache yet
        if (!timeline || Array.isArray(timeline) || !timeline.refs.length) {
          that.timelines[key] = {
            refs: events.map((evt) => [evt.id, evt.created_at]),
            filter,
            urls
          }
          return onEvents([...events], true)
        }

        // Prevent concurrent requests from duplicating the same event
        const firstRefCreatedAt = timeline.refs[0][1]
        const newRefs = events
          .filter((evt) => evt.created_at > firstRefCreatedAt)
          .map((evt) => [evt.id, evt.created_at] as TTimelineRef)

        if (events.length >= filter.limit) {
          // if new refs are more than limit, means old refs are too old, replace them
          timeline.refs = newRefs
          onEvents([...events], true)
        } else {
          // merge new refs with old refs
          timeline.refs = newRefs.concat(timeline.refs)
          onEvents([...events.concat(cachedEvents).slice(0, filter.limit)], true)
        }
      },
      onclose: onClose
    })

    return {
      timelineKey: key,
      closer: () => {
        onEvents = () => {}
        onNew = () => {}
        subCloser.close()
      }
    }
  }

  private async _loadMoreTimeline(key: string, until: number, limit: number) {
    const timeline = this.timelines[key]
    if (!timeline || Array.isArray(timeline)) return []

    const { filter, urls, refs } = timeline
    const startIdx = refs.findIndex(([, createdAt]) => createdAt <= until)
    const cachedEvents =
      startIdx >= 0
        ? ((
            await this.eventDataLoader.loadMany(
              refs.slice(startIdx, startIdx + limit).map(([id]) => id)
            )
          ).filter((evt) => !!evt && !(evt instanceof Error)) as NEvent[])
        : []
    if (cachedEvents.length >= limit) {
      return cachedEvents
    }

    until = cachedEvents.length ? cachedEvents[cachedEvents.length - 1].created_at - 1 : until
    limit = limit - cachedEvents.length
    let events = await this.query(urls, { ...filter, until, limit })
    events.forEach((evt) => {
      this.addEventToCache(evt)
    })
    events = events.sort((a, b) => b.created_at - a.created_at).slice(0, limit)

    // Prevent concurrent requests from duplicating the same event
    const lastRefCreatedAt = refs.length > 0 ? refs[refs.length - 1][1] : dayjs().unix()
    timeline.refs.push(
      ...events
        .filter((evt) => evt.created_at < lastRefCreatedAt)
        .map((evt) => [evt.id, evt.created_at] as TTimelineRef)
    )
    return [...cachedEvents, ...events]
  }

  /** =========== Event =========== */

  getSeenEventRelays(eventId: string) {
    return Array.from(this.pool.seenOn.get(eventId)?.values() || [])
  }

  getSeenEventRelayUrls(eventId: string) {
    return Array.from(new Set(this.getSeenEventRelays(eventId).map((relay) => relay.url)))
  }

  getEventHints(eventId: string) {
    return this.getSeenEventRelayUrls(eventId)
  }

  getEventHint(eventId: string) {
    return this.getSeenEventRelayUrls(eventId)[0] ?? ''
  }

  trackEventSeenOn(eventId: string, relay: AbstractRelay) {
    let set = this.pool.seenOn.get(eventId)
    if (!set) {
      set = new Set()
      this.pool.seenOn.set(eventId, set)
    }
    set.add(relay)
  }

  private async query(urls: string[], filter: Filter | Filter[], onevent?: (evt: NEvent) => void) {
    return await new Promise<NEvent[]>((resolve) => {
      const events: NEvent[] = []
      const sub = this.subscribe(urls, filter, {
        onevent(evt) {
          onevent?.(evt)
          events.push(evt)
        },
        oneose: (eosed) => {
          if (eosed) {
            sub.close()
            resolve(events)
          }
        },
        onclose: () => {
          resolve(events)
        }
      })
    })
  }

  async fetchEvents(
    urls: string[],
    filter: Filter | Filter[],
    {
      onevent,
      cache = false
    }: {
      onevent?: (evt: NEvent) => void
      cache?: boolean
    } = {}
  ) {
    const relays = Array.from(new Set(urls))
    const events = await this.query(relays.length > 0 ? relays : BIG_RELAY_URLS, filter, onevent)
    if (cache) {
      events.forEach((evt) => {
        this.addEventToCache(evt)
      })
    }
    return events
  }

  async fetchEvent(id: string): Promise<NEvent | undefined> {
    if (!/^[0-9a-f]{64}$/.test(id)) {
      let eventId: string | undefined
      let coordinate: string | undefined
      const { type, data } = nip19.decode(id)
      switch (type) {
        case 'note':
          eventId = data
          break
        case 'nevent':
          eventId = data.id
          break
        case 'naddr':
          coordinate = getReplaceableCoordinate(data.kind, data.pubkey, data.identifier)
          break
      }
      if (coordinate) {
        const cache = this.replaceableEventCacheMap.get(coordinate)
        if (cache) {
          return cache
        }
      } else if (eventId) {
        const cache = this.eventCacheMap.get(eventId)
        if (cache) {
          return cache
        }
      }
    }
    return this.eventDataLoader.load(id)
  }

  // Force retry fetching an event by clearing its cache
  async fetchEventForceRetry(id: string): Promise<NEvent | undefined> {
    // Clear the cache for this specific event
    this.eventCacheMap.delete(id)
    
    // Also clear from replaceable event cache if it's a replaceable event
    if (!/^[0-9a-f]{64}$/.test(id)) {
      const { type, data } = nip19.decode(id)
      if (type === 'naddr') {
        const coordinate = getReplaceableCoordinate(data.kind, data.pubkey, data.identifier)
        if (coordinate) {
          this.replaceableEventCacheMap.delete(coordinate)
        }
      }
    }
    
    // Now fetch with a fresh attempt
    return this._fetchEvent(id)
  }

  // Force clear relay connection state to allow fresh connections
  clearRelayConnectionState(relayUrls?: string[]) {
    if (relayUrls) {
      // Clear state for specific relays
      relayUrls.forEach(url => {
        this.failureCount.delete(url)
        this.circuitBreaker.delete(url)
        this.requestThrottle.delete(url)
        this.concurrentRequests.delete(url)
        this.blacklistedRelays.delete(url) // Also clear blacklist
        logger.debug(`Cleared connection state for relay: ${url}`)
      })
    } else {
      // Clear all relay state
      this.failureCount.clear()
      this.circuitBreaker.clear()
      this.requestThrottle.clear()
      this.concurrentRequests.clear()
      this.blacklistedRelays.clear() // Clear blacklist
      this.globalRequestThrottle = 0 // Reset global throttle
      logger.debug('Cleared all relay connection state')
    }
  }

  // Blacklist a problematic relay temporarily
  private blacklistRelay(relayUrl: string): void {
    this.blacklistedRelays.set(relayUrl, Date.now())
    logger.debug(`🚫 Blacklisted problematic relay: ${relayUrl}`)
  }

  // Check if a relay is blacklisted
  private isRelayBlacklisted(relayUrl: string): boolean {
    const blacklistTime = this.blacklistedRelays.get(relayUrl)
    if (!blacklistTime) return false
    
    const now = Date.now()
    if (now - blacklistTime > this.BLACKLIST_TIMEOUT) {
      // Blacklist expired, remove it
      this.blacklistedRelays.delete(relayUrl)
      logger.debug(`🟢 Blacklist expired for relay: ${relayUrl}`)
      return false
    }
    
    return true
  }


  addEventToCache(event: NEvent) {
    this.eventDataLoader.prime(event.id, Promise.resolve(event))
    if (isReplaceableEvent(event.kind)) {
      const coordinate = getReplaceableCoordinateFromEvent(event)
      const cachedEvent = this.replaceableEventCacheMap.get(coordinate)
      if (!cachedEvent || compareEvents(event, cachedEvent) > 0) {
        this.replaceableEventCacheMap.set(coordinate, event)
      }
    }
  }

  /**
   * Get list of relays that were already tried in tiers 1-3
   */
  async getAlreadyTriedRelays(): Promise<string[]> {
    const userRelayList = this.pubkey ? await this.fetchRelayList(this.pubkey) : { read: [], write: [] }
    
    // Get favorite relays from storage (includes user's configured relay sets)
    const storedRelaySets = storage.getRelaySets()
    const favoriteRelays: string[] = this.pubkey ? DEFAULT_FAVORITE_RELAYS : BIG_RELAY_URLS.slice()
    
    // Add relays from stored relay sets
    storedRelaySets.forEach(({ relayUrls }) => {
      relayUrls.forEach((url) => {
        if (!favoriteRelays.includes(url)) {
          favoriteRelays.push(url)
        }
      })
    })
    
    // Tier 1: User's read relays + fast read relays + favorite relays
    const tier1Relays = Array.from(new Set([
      ...userRelayList.read.map(url => normalizeUrl(url) || url),
      ...FAST_READ_RELAY_URLS.map(url => normalizeUrl(url) || url),
      ...favoriteRelays.map(url => normalizeUrl(url) || url)
    ]))
    
    // Tier 2: User's write relays + fast write relays  
    const tier2Relays = Array.from(new Set([
      ...userRelayList.write.map(url => normalizeUrl(url) || url),
      ...FAST_WRITE_RELAY_URLS.map(url => normalizeUrl(url) || url)
    ]))
    
    // Tier 3: Search relays + big relays
    const tier3Relays = Array.from(new Set([
      ...SEARCHABLE_RELAY_URLS.map(url => normalizeUrl(url) || url),
      ...BIG_RELAY_URLS.map(url => normalizeUrl(url) || url)
    ]))
    
    return Array.from(new Set([
      ...tier1Relays,
      ...tier2Relays,
      ...tier3Relays
    ]))
  }

  // Opt-in method to fetch from author's relays, relay hints, and "seen on" relays
  async fetchEventWithExternalRelays(id: string): Promise<NEvent | undefined> {
    // Clear cache to force new fetch
    this.eventCacheMap.delete(id)
    
    // Parse the ID to extract relay hints and author
    let relayHints: string[] = []
    let author: string | undefined
    
    if (!/^[0-9a-f]{64}$/.test(id)) {
      try {
        const { type, data } = nip19.decode(id)
        if (type === 'nevent') {
          if (data.relays) relayHints = data.relays
          if (data.author) author = data.author
        } else if (type === 'naddr') {
          if (data.relays) relayHints = data.relays
          author = data.pubkey
        }
      } catch (err) {
        console.error('Failed to decode bech32 ID:', id, err)
        // Continue with empty relay hints and author
      }
    }

    // Collect external relays: author's outbox + relay hints + seen on
    const externalRelays: string[] = []
    
    if (author) {
      const authorRelayList = await this.fetchRelayList(author)
      externalRelays.push(...authorRelayList.write.slice(0, 6))
    }
    
    if (relayHints.length > 0) {
      externalRelays.push(...relayHints)
    }
    
    const seenOn = this.getSeenEventRelayUrls(id)
    externalRelays.push(...seenOn)

    // Normalize and deduplicate the combined external relays
    const normalizedExternalRelays = externalRelays.map(url => normalizeUrl(url) || url)
    const uniqueExternalRelays = Array.from(new Set(normalizedExternalRelays))
    
    if (uniqueExternalRelays.length === 0) {
      return undefined
    }

    return this.tryHarderToFetchEvent(uniqueExternalRelays, { ids: [id], limit: 1 })
  }

  private async _fetchEvent(id: string): Promise<NEvent | undefined> {
    let filter: Filter | undefined
    if (/^[0-9a-f]{64}$/.test(id)) {
      filter = { ids: [id] }
    } else {
      try {
        const { type, data } = nip19.decode(id)
        switch (type) {
          case 'note':
            filter = { ids: [data] }
            break
          case 'nevent':
            filter = { ids: [data.id] }
            break
          case 'naddr':
            filter = {
              authors: [data.pubkey],
              kinds: [data.kind],
              limit: 1
            }
            if (data.identifier) {
              filter['#d'] = [data.identifier]
            }
        }
      } catch {
        console.error('Failed to decode bech32 ID - likely malformed:', id)
        // Malformed naddr/nevent from broken clients - can't fetch it
        return undefined
      }
    }
    if (!filter) {
      throw new Error('Invalid id')
    }

    // Use unified tiered fetching for both regular and replaceable events
    const event = await this.fetchEventTiered(filter)

    if (event && event.id !== id) {
      this.addEventToCache(event)
    }

    return event
  }

  /**
   * Unified tiered fetching for both regular and replaceable events
   */
  private async fetchEventTiered(filter: Filter): Promise<NEvent | undefined> {
    const userRelayList = this.pubkey ? await this.fetchRelayList(this.pubkey) : { read: [], write: [] }

    // Tier 1: User's read relays + fast read relays (deduplicated)
    const tier1Relays = Array.from(new Set([
      ...userRelayList.read.map(url => normalizeUrl(url) || url),
      ...FAST_READ_RELAY_URLS.map(url => normalizeUrl(url) || url)
    ]))
    const tier1Event = await this.tryHarderToFetchEvent(tier1Relays, filter)
    if (tier1Event) { return tier1Event }

    // Tier 2: User's write relays + fast write relays (deduplicated)
    const tier2Relays = Array.from(new Set([
      ...userRelayList.write.map(url => normalizeUrl(url) || url),
      ...FAST_WRITE_RELAY_URLS.map(url => normalizeUrl(url) || url)
    ]))
    const tier2Event = await this.tryHarderToFetchEvent(tier2Relays, filter)
    if (tier2Event) { return tier2Event }

    // Tier 3: Search relays + big relays (deduplicated)
    const tier3Relays = Array.from(new Set([
      ...SEARCHABLE_RELAY_URLS.map(url => normalizeUrl(url) || url),
      ...BIG_RELAY_URLS.map(url => normalizeUrl(url) || url)
    ]))
    const tier3Event = await this.tryHarderToFetchEvent(tier3Relays, filter)
    if (tier3Event) { return tier3Event }

    // Tier 4: Not found - external relays require opt-in (see fetchEventWithExternalRelays)
    return undefined
  }

  private async tryHarderToFetchEvent(
    relayUrls: string[],
    filter: Filter,
    alreadyFetchedFromBigRelays = false
  ) {
    try {
      // Privacy: Don't fetch author's relays, only use provided relays or defaults
      if (!relayUrls.length && !alreadyFetchedFromBigRelays) {
        relayUrls = BIG_RELAY_URLS
      }
      if (!relayUrls.length) return undefined

      // Normalize relay URLs (remove trailing slashes for consistency)
      const normalizedUrls = relayUrls.map(url => url.endsWith('/') ? url.slice(0, -1) : url)
      
      const events = await this.query(normalizedUrls, filter)
      
      if (events.length === 0) {
        return undefined
      }
      
      const result = events.sort((a, b) => b.created_at - a.created_at)[0]
      return result
    } catch (error) {
      console.error('Error in tryHarderToFetchEvent:', error)
      return undefined
    }
  }


  /** =========== Following favorite relays =========== */

  private followingFavoriteRelaysCache = new LRUCache<string, Promise<[string, string[]][]>>({
    max: 10,
    fetchMethod: this._fetchFollowingFavoriteRelays.bind(this)
  })

  async fetchFollowingFavoriteRelays(pubkey: string) {
    return this.followingFavoriteRelaysCache.fetch(pubkey)
  }

  private async _fetchFollowingFavoriteRelays(pubkey: string) {
    const fetchNewData = async () => {
      const followings = await this.fetchFollowings(pubkey)
      const events = await this.fetchEvents(BIG_RELAY_URLS, {
        authors: followings,
        kinds: [ExtendedKind.FAVORITE_RELAYS, kinds.Relaysets],
        limit: 1000
      })
      const alreadyExistsFavoriteRelaysPubkeySet = new Set<string>()
      const alreadyExistsRelaySetsPubkeySet = new Set<string>()
      const uniqueEvents: NEvent[] = []
      events
        .sort((a, b) => b.created_at - a.created_at)
        .forEach((event) => {
          if (event.kind === ExtendedKind.FAVORITE_RELAYS) {
            if (alreadyExistsFavoriteRelaysPubkeySet.has(event.pubkey)) return
            alreadyExistsFavoriteRelaysPubkeySet.add(event.pubkey)
          } else if (event.kind === kinds.Relaysets) {
            if (alreadyExistsRelaySetsPubkeySet.has(event.pubkey)) return
            alreadyExistsRelaySetsPubkeySet.add(event.pubkey)
          } else {
            return
          }
          uniqueEvents.push(event)
        })

      const relayMap = new Map<string, Set<string>>()
      uniqueEvents.forEach((event) => {
        event.tags.forEach(([tagName, tagValue]) => {
          if (tagName === 'relay' && tagValue && isWebsocketUrl(tagValue)) {
            const url = normalizeUrl(tagValue)
            relayMap.set(url, (relayMap.get(url) || new Set()).add(event.pubkey))
          }
        })
      })
      const relayMapEntries = Array.from(relayMap.entries())
        .sort((a, b) => b[1].size - a[1].size)
        .map(([url, pubkeys]) => [url, Array.from(pubkeys)]) as [string, string[]][]

      indexedDb.putFollowingFavoriteRelays(pubkey, relayMapEntries)
      return relayMapEntries
    }

    const cached = await indexedDb.getFollowingFavoriteRelays(pubkey)
    if (cached) {
      fetchNewData()
      return cached
    }
    return fetchNewData()
  }

  /** =========== Followings =========== */

  async initUserIndexFromFollowings(pubkey: string, signal: AbortSignal) {
    const followings = await this.fetchFollowings(pubkey)
    for (let i = 0; i * 20 < followings.length; i++) {
      if (signal.aborted) return
      await Promise.all(
        followings.slice(i * 20, (i + 1) * 20).map((pubkey) => this.fetchProfileEvent(pubkey))
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  /** =========== Profile =========== */

  async searchProfiles(relayUrls: string[], filter: Filter): Promise<TProfile[]> {
    const events = await this.query(relayUrls, {
      ...filter,
      kinds: [kinds.Metadata]
    })

    const profileEvents = events.sort((a, b) => b.created_at - a.created_at)
    await Promise.allSettled(profileEvents.map((profile) => this.addUsernameToIndex(profile)))
    profileEvents.forEach((profile) => this.updateProfileEventCache(profile))
    return profileEvents.map((profileEvent) => getProfileFromEvent(profileEvent))
  }

  async searchNpubsFromLocal(query: string, limit: number = 100) {
    const result = await this.userIndex.searchAsync(query, { limit })
    return result.map((pubkey) => pubkeyToNpub(pubkey as string)).filter(Boolean) as string[]
  }

  async searchProfilesFromLocal(query: string, limit: number = 100) {
    const npubs = await this.searchNpubsFromLocal(query, limit)
    const profiles = await Promise.all(npubs.map((npub) => this.fetchProfile(npub)))
    return profiles.filter((profile) => !!profile) as TProfile[]
  }

  private async addUsernameToIndex(profileEvent: NEvent) {
    try {
      const profileObj = JSON.parse(profileEvent.content)
      const text = [
        profileObj.display_name?.trim() ?? '',
        profileObj.name?.trim() ?? '',
        profileObj.nip05
          ?.split('@')
          .map((s: string) => s.trim())
          .join(' ') ?? ''
      ].join(' ')
      if (!text) return

      await this.userIndex.addAsync(profileEvent.pubkey, text)
    } catch {
      return
    }
  }

  async fetchProfileEvent(id: string, skipCache: boolean = false): Promise<NEvent | undefined> {
    let pubkey: string | undefined
    let relays: string[] = []
    if (/^[0-9a-f]{64}$/.test(id)) {
      pubkey = id
    } else {
      const { data, type } = nip19.decode(id)
      switch (type) {
        case 'npub':
          pubkey = data
          break
        case 'nprofile':
          pubkey = data.pubkey
          if (data.relays) relays = data.relays
          break
      }
    }

    if (!pubkey) {
      throw new Error('Invalid id')
    }
    if (!skipCache) {
      const localProfile = await indexedDb.getReplaceableEvent(pubkey, kinds.Metadata)
      if (localProfile) {
        return localProfile
      }
    }
    const profileFromBigRelays = await this.replaceableEventFromBigRelaysDataloader.load({
      pubkey,
      kind: kinds.Metadata
    })
    if (profileFromBigRelays) {
      this.addUsernameToIndex(profileFromBigRelays)
      return profileFromBigRelays
    }

    if (!relays.length) {
      return undefined
    }

    const profileEvent = await this.tryHarderToFetchEvent(
      relays,
      {
        authors: [pubkey],
        kinds: [kinds.Metadata],
        limit: 1
      },
      true
    )

    if (profileEvent) {
      this.addUsernameToIndex(profileEvent)
      indexedDb.putReplaceableEvent(profileEvent)
    }

    return profileEvent
  }

  async fetchProfile(id: string, skipCache: boolean = false): Promise<TProfile | undefined> {
    const profileEvent = await this.fetchProfileEvent(id, skipCache)
    if (profileEvent) {
      return getProfileFromEvent(profileEvent)
    }

    try {
      const pubkey = userIdToPubkey(id)
      return { pubkey, npub: pubkeyToNpub(pubkey) ?? '', username: formatPubkey(pubkey) }
    } catch {
      return undefined
    }
  }

  async updateProfileEventCache(event: NEvent) {
    await this.updateReplaceableEventFromBigRelaysCache(event)
  }

  /** =========== Relay list =========== */

  async fetchRelayListEvent(pubkey: string) {
    const [relayEvent] = await this.fetchReplaceableEventsFromBigRelays([pubkey], kinds.RelayList)
    return relayEvent ?? null
  }

  async fetchRelayList(pubkey: string): Promise<TRelayList> {
    const [relayList] = await this.fetchRelayLists([pubkey])
    return relayList
  }

  async fetchRelayLists(pubkeys: string[]): Promise<TRelayList[]> {
    const relayEvents = await this.fetchReplaceableEventsFromBigRelays(pubkeys, kinds.RelayList)

    return relayEvents.map((event) => {
      if (event) {
        return getRelayListFromEvent(event)
      }
      return {
        write: Array.from(new Set([...FAST_WRITE_RELAY_URLS, ...BIG_RELAY_URLS])).slice(0, 8), // Combine fast write + big relays for better redundancy (deduplicated)
        read: BIG_RELAY_URLS,
        originalRelays: []
      }
    })
  }

  async forceUpdateRelayListEvent(pubkey: string) {
    await this.replaceableEventBatchLoadFn([{ pubkey, kind: kinds.RelayList }])
  }

  async updateRelayListCache(event: NEvent) {
    await this.updateReplaceableEventFromBigRelaysCache(event)
  }

  /**
   * Fetch blocked relays from IndexedDB
   */
  async fetchBlockedRelays(pubkey: string): Promise<string[]> {
    try {
      const blockedRelaysEvent = await indexedDb.getReplaceableEvent(pubkey, ExtendedKind.BLOCKED_RELAYS)
      if (!blockedRelaysEvent) {
        return []
      }
      
      // Extract relay URLs from the relay tags
      const relayUrls = blockedRelaysEvent.tags
        .filter(([tagName]) => tagName === 'relay')
        .map(([, url]) => url)
        .filter(Boolean)
      
      return relayUrls
    } catch (error) {
      console.error('Failed to fetch blocked relays:', error)
      return []
    }
  }

  /**
   * Filter out blocked relays from a relay list
   */
  private filterBlockedRelays(relays: string[], blockedRelays: string[]): string[] {
    if (!blockedRelays || blockedRelays.length === 0) {
      return relays
    }

    // Helper function to safely normalize URLs
    const safeNormalize = (url: string): string => {
      const normalized = normalizeUrl(url)
      return normalized || url
    }

    const normalizedBlocked = blockedRelays.map(safeNormalize)
    return relays.filter(relay => {
      const normalizedRelay = safeNormalize(relay)
      return !normalizedBlocked.includes(normalizedRelay)
    })
  }

  /** =========== Replaceable event from big relays dataloader =========== */

  private replaceableEventFromBigRelaysDataloader = new DataLoader<
    { pubkey: string; kind: number },
    NEvent | null,
    string
  >(this.replaceableEventFromBigRelaysBatchLoadFn.bind(this), {
    batchScheduleFn: (callback) => setTimeout(callback, 50),
    maxBatchSize: 500,
    cacheKeyFn: ({ pubkey, kind }) => `${pubkey}:${kind}`
  })

  private async replaceableEventFromBigRelaysBatchLoadFn(
    params: readonly { pubkey: string; kind: number }[]
  ) {
    const groups = new Map<number, string[]>()
    params.forEach(({ pubkey, kind }) => {
      if (!groups.has(kind)) {
        groups.set(kind, [])
      }
      groups.get(kind)!.push(pubkey)
    })

    const eventsMap = new Map<string, NEvent>()
    await Promise.allSettled(
      Array.from(groups.entries()).map(async ([kind, pubkeys]) => {
        const events = await this.query(PROFILE_FETCH_RELAY_URLS, {
          authors: pubkeys,
          kinds: [kind]
        })

        for (const event of events) {
          const key = `${event.pubkey}:${event.kind}`
          const existing = eventsMap.get(key)
          if (!existing || existing.created_at < event.created_at) {
            eventsMap.set(key, event)
          }
        }
      })
    )

    return params.map(({ pubkey, kind }) => {
      const key = `${pubkey}:${kind}`
      const event = eventsMap.get(key)
      if (event) {
        indexedDb.putReplaceableEvent(event)
        return event
      } else {
        indexedDb.putNullReplaceableEvent(pubkey, kind)
        return null
      }
    })
  }

  private async fetchReplaceableEventsFromBigRelays(pubkeys: string[], kind: number) {
    const events = await indexedDb.getManyReplaceableEvents(pubkeys, kind)
    const nonExistingPubkeyIndexMap = new Map<string, number>()
    pubkeys.forEach((pubkey, i) => {
      if (events[i] === undefined) {
        nonExistingPubkeyIndexMap.set(pubkey, i)
      }
    })
    const newEvents = await this.replaceableEventFromBigRelaysDataloader.loadMany(
      Array.from(nonExistingPubkeyIndexMap.keys()).map((pubkey) => ({ pubkey, kind }))
    )
    newEvents.forEach((event) => {
      if (event && !(event instanceof Error)) {
        const index = nonExistingPubkeyIndexMap.get(event.pubkey)
        if (index !== undefined) {
          events[index] = event
        }
      }
    })

    return events
  }

  private async updateReplaceableEventFromBigRelaysCache(event: NEvent) {
    this.replaceableEventFromBigRelaysDataloader.clear({ pubkey: event.pubkey, kind: event.kind })
    this.replaceableEventFromBigRelaysDataloader.prime(
      { pubkey: event.pubkey, kind: event.kind },
      Promise.resolve(event)
    )
    await indexedDb.putReplaceableEvent(event)
  }

  /** =========== Replaceable event dataloader =========== */

  private replaceableEventDataLoader = new DataLoader<
    { pubkey: string; kind: number; d?: string },
    NEvent | null,
    string
  >(this.replaceableEventBatchLoadFn.bind(this), {
    cacheKeyFn: ({ pubkey, kind, d }) => `${kind}:${pubkey}:${d ?? ''}`
  })

  private async replaceableEventBatchLoadFn(
    params: readonly { pubkey: string; kind: number; d?: string }[]
  ) {
    const groups = new Map<string, { kind: number; d?: string }[]>()
    params.forEach(({ pubkey, kind, d }) => {
      if (!groups.has(pubkey)) {
        groups.set(pubkey, [])
      }
      groups.get(pubkey)!.push({ kind: kind, d })
    })

    const eventMap = new Map<string, NEvent | null>()
    await Promise.allSettled(
      Array.from(groups.entries()).map(async ([pubkey, _params]) => {
        const groupByKind = new Map<number, string[]>()
        _params.forEach(({ kind, d }) => {
          if (!groupByKind.has(kind)) {
            groupByKind.set(kind, [])
          }
          if (d) {
            groupByKind.get(kind)!.push(d)
          }
        })
        const filters = Array.from(groupByKind.entries()).map(
          ([kind, dList]) =>
            (dList.length > 0
              ? {
                  authors: [pubkey],
                  kinds: [kind],
                  '#d': dList
                }
              : { authors: [pubkey], kinds: [kind] }) as Filter
        )
        const events = await this.query(PROFILE_FETCH_RELAY_URLS, filters)

        for (const event of events) {
          const key = getReplaceableCoordinateFromEvent(event)
          const existing = eventMap.get(key)
          if (!existing || existing.created_at < event.created_at) {
            eventMap.set(key, event)
          }
        }
      })
    )

    return params.map(({ pubkey, kind, d }) => {
      const key = `${kind}:${pubkey}:${d ?? ''}`
      const event = eventMap.get(key)
      if (event) {
        indexedDb.putReplaceableEvent(event)
        return event
      } else {
        indexedDb.putNullReplaceableEvent(pubkey, kind, d)
        return null
      }
    })
  }

  private async fetchReplaceableEvent(pubkey: string, kind: number, d?: string) {
    const storedEvent = await indexedDb.getReplaceableEvent(pubkey, kind, d)
    if (storedEvent !== undefined) {
      return storedEvent
    }

    return await this.replaceableEventDataLoader.load({ pubkey, kind, d })
  }

  private async updateReplaceableEventCache(event: NEvent) {
    this.replaceableEventDataLoader.clear({ pubkey: event.pubkey, kind: event.kind })
    this.replaceableEventDataLoader.prime(
      { pubkey: event.pubkey, kind: event.kind },
      Promise.resolve(event)
    )
    await indexedDb.putReplaceableEvent(event)
  }

  /** =========== Replaceable event =========== */

  async fetchFollowListEvent(pubkey: string) {
    return await this.fetchReplaceableEvent(pubkey, kinds.Contacts)
  }

  async fetchFollowings(pubkey: string) {
    const followListEvent = await this.fetchFollowListEvent(pubkey)
    return followListEvent ? getPubkeysFromPTags(followListEvent.tags) : []
  }

  async updateFollowListCache(evt: NEvent) {
    await this.updateReplaceableEventCache(evt)
  }

  async fetchMuteListEvent(pubkey: string) {
    return await this.fetchReplaceableEvent(pubkey, kinds.Mutelist)
  }

  async fetchBookmarkListEvent(pubkey: string) {
    return this.fetchReplaceableEvent(pubkey, kinds.BookmarkList)
  }

  async fetchInterestListEvent(pubkey: string) {
    return this.fetchReplaceableEvent(pubkey, 10015)
  }

  async fetchPinListEvent(pubkey: string) {
    return this.fetchReplaceableEvent(pubkey, 10001)
  }

  async fetchBlossomServerListEvent(pubkey: string) {
    return await this.fetchReplaceableEvent(pubkey, ExtendedKind.BLOSSOM_SERVER_LIST)
  }

  async fetchBlossomServerList(pubkey: string) {
    const evt = await this.fetchBlossomServerListEvent(pubkey)
    return evt ? getServersFromServerTags(evt.tags) : []
  }

  async updateBlossomServerListEventCache(evt: NEvent) {
    await this.updateReplaceableEventCache(evt)
  }

  async fetchEmojiSetEvents(pointers: string[]) {
    const params = pointers
      .map((pointer) => {
        const [kindStr, pubkey, d = ''] = pointer.split(':')
        if (!pubkey || !kindStr) return null

        const kind = parseInt(kindStr, 10)
        if (kind !== kinds.Emojisets) return null

        return { pubkey, kind, d }
      })
      .filter(Boolean) as { pubkey: string; kind: number; d: string }[]
    return await this.replaceableEventDataLoader.loadMany(params)
  }

  // ================= Performance Optimization =================

  private optimizeRelaySelection(relays: string[]): string[] {
    // Filter out invalid or problematic relay URLs
    const validRelays = relays.filter(url => {
      try {
        // Skip empty or invalid URLs
        if (!url || typeof url !== 'string') return false
        
        // Skip blacklisted relays
        if (this.isRelayBlacklisted(url)) {
          logger.debug(`Skipping blacklisted relay: ${url}`)
          return false
        }
        
        // Skip relays with open circuit breaker
        if (this.isCircuitBreakerOpen(url)) {
          logger.debug(`Skipping relay with open circuit breaker: ${url}`)
          return false
        }
        
        // Validate websocket URL format
        if (!isWebsocketUrl(url)) return false

        // Skip URLs that are clearly invalid
        const normalizedUrl = normalizeUrl(url)
        if (!normalizedUrl) return false

        return true
      } catch (error) {
        logger.debug(`Skipping invalid relay URL: ${url}`, error)
        return false
      }
    })

    // For profile feeds, prioritize write relays to ensure user's own responses are found
    // Check if this looks like a profile feed (relays include write relays)
    const hasWriteRelays = validRelays.some(url => 
      FAST_WRITE_RELAY_URLS.some(writeRelay => normalizeUrl(writeRelay) === normalizeUrl(url))
    )
    
    if (hasWriteRelays) {
      // For profile feeds: prioritize write relays and allow more relays
      const writeRelays = validRelays.filter(url => 
        FAST_WRITE_RELAY_URLS.some(writeRelay => normalizeUrl(writeRelay) === normalizeUrl(url))
      )
      const otherRelays = validRelays.filter(url => 
        !FAST_WRITE_RELAY_URLS.some(writeRelay => normalizeUrl(writeRelay) === normalizeUrl(url))
      )
      
      // Return write relays first, then others (up to 6 total for profile feeds - reduced from 8)
      return [...writeRelays, ...otherRelays].slice(0, 6)
    }

    // For other feeds: limit to 3 relays to prevent "too many concurrent REQs" errors (reduced from 5)
    return validRelays.slice(0, 5)
  }

  // ================= Utils =================

  private async throttleRequest(relayUrl: string): Promise<void> {
    const now = Date.now()
    const lastRequest = this.requestThrottle.get(relayUrl) || 0
    const failures = this.failureCount.get(relayUrl) || 0
    const concurrent = this.concurrentRequests.get(relayUrl) || 0
    
    // Global throttling to prevent overwhelming all relays
    const globalDelay = Math.max(0, this.GLOBAL_REQUEST_COOLDOWN - (now - this.globalRequestThrottle))
    if (globalDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, globalDelay))
    }
    this.globalRequestThrottle = Date.now()
    
    // Check concurrent request limit
    if (concurrent >= this.MAX_CONCURRENT_REQUESTS) {
      logger.debug(`Relay ${relayUrl} has ${concurrent} concurrent requests, waiting...`)
      // Wait for a concurrent request to complete
      while (this.concurrentRequests.get(relayUrl) || 0 >= this.MAX_CONCURRENT_REQUESTS) {
        await new Promise(resolve => setTimeout(resolve, 2000)) // Increased wait time
      }
    }
    
    // Calculate delay based on failures (exponential backoff)
    let delay = this.REQUEST_COOLDOWN
    if (failures >= this.MAX_FAILURES) {
      delay = Math.min(this.REQUEST_COOLDOWN * Math.pow(2, failures - this.MAX_FAILURES), 60000) // Max 60 seconds
    } else if (now - lastRequest < this.REQUEST_COOLDOWN) {
      delay = this.REQUEST_COOLDOWN - (now - lastRequest)
    }
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    
    // Increment concurrent request counter
    this.concurrentRequests.set(relayUrl, (this.concurrentRequests.get(relayUrl) || 0) + 1)
    this.requestThrottle.set(relayUrl, Date.now())
  }

  private recordSuccess(relayUrl: string): void {
    // Reset failure count on success
    this.failureCount.delete(relayUrl)
    // Decrement concurrent request counter
    const current = this.concurrentRequests.get(relayUrl) || 0
    if (current > 0) {
      this.concurrentRequests.set(relayUrl, current - 1)
    }
  }

  private recordFailure(relayUrl: string): void {
    const currentFailures = this.failureCount.get(relayUrl) || 0
    const newFailures = currentFailures + 1
    this.failureCount.set(relayUrl, newFailures)
    
    // Decrement concurrent request counter
    const current = this.concurrentRequests.get(relayUrl) || 0
    if (current > 0) {
      this.concurrentRequests.set(relayUrl, current - 1)
    }
    
    // Activate circuit breaker immediately on any failure to prevent "too many concurrent REQs"
    if (newFailures >= this.MAX_FAILURES) {
      this.circuitBreaker.set(relayUrl, Date.now())
      logger.debug(`🔴 Circuit breaker activated for ${relayUrl} (${newFailures} failures)`)
    }
  }

  private isCircuitBreakerOpen(relayUrl: string): boolean {
    const breakerTime = this.circuitBreaker.get(relayUrl)
    if (!breakerTime) return false
    
    const now = Date.now()
    if (now - breakerTime > this.CIRCUIT_BREAKER_TIMEOUT) {
      // Circuit breaker timeout expired, reset it
      this.circuitBreaker.delete(relayUrl)
      this.failureCount.delete(relayUrl)
      this.concurrentRequests.delete(relayUrl) // Clean up concurrent counter
      logger.debug(`🟢 Circuit breaker reset for ${relayUrl}`)
      return false
    }
    
    return true
  }


  async generateSubRequestsForPubkeys(pubkeys: string[], myPubkey?: string | null) {
    // Privacy: Only use user's own relays + defaults, never fetch other users' relays
    let urls = BIG_RELAY_URLS
    if (myPubkey) {
      const relayList = await this.fetchRelayList(myPubkey)
      urls = relayList.read.concat(BIG_RELAY_URLS).slice(0, 5)
    }
    
    // If many websocket connections are initiated simultaneously, it will be
    // very slow on Safari (for unknown reason)
    if (isSafari()) {
      return [{ urls, filter: { authors: pubkeys } }]
    }

    // Simplified: Use user's relays for all followed users instead of individual relay lists
    return [{ urls, filter: { authors: pubkeys } }]
  }
}

const instance = ClientService.getInstance()
export default instance
