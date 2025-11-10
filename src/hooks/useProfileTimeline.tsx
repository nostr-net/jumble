import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Event } from 'nostr-tools'
import client from '@/services/client.service'
import { FAST_READ_RELAY_URLS } from '@/constants'
import { normalizeUrl } from '@/lib/url'

type ProfileTimelineCacheEntry = {
  events: Event[]
  lastUpdated: number
}

const timelineCache = new Map<string, ProfileTimelineCacheEntry>()
const relayGroupCache = new Map<string, string[][]>()

type UseProfileTimelineOptions = {
  pubkey: string
  cacheKey: string
  kinds: number[]
  limit?: number
  filterPredicate?: (event: Event) => boolean
}

type UseProfileTimelineResult = {
  events: Event[]
  isLoading: boolean
  refresh: () => void
}

async function getRelayGroups(pubkey: string): Promise<string[][]> {
  const cached = relayGroupCache.get(pubkey)
  if (cached) {
    return cached
  }

  const [relayList, favoriteRelays] = await Promise.all([
    client.fetchRelayList(pubkey).catch(() => ({ read: [], write: [] })),
    client.fetchFavoriteRelays(pubkey).catch(() => [])
  ])

  const groups: string[][] = []

  const normalizeList = (urls?: string[]) =>
    Array.from(
      new Set(
        (urls || [])
          .map((url) => normalizeUrl(url))
          .filter((value): value is string => !!value)
      )
    )

  const readRelays = normalizeList(relayList.read)
  if (readRelays.length) {
    groups.push(readRelays)
  }

  const writeRelays = normalizeList(relayList.write)
  if (writeRelays.length) {
    groups.push(writeRelays)
  }

  const favoriteRelayList = normalizeList(favoriteRelays)
  if (favoriteRelayList.length) {
    groups.push(favoriteRelayList)
  }

  const fastReadRelays = normalizeList(FAST_READ_RELAY_URLS)
  if (fastReadRelays.length) {
    groups.push(fastReadRelays)
  }

  if (!groups.length) {
    relayGroupCache.set(pubkey, [fastReadRelays])
    return [fastReadRelays]
  }

  relayGroupCache.set(pubkey, groups)
  return groups
}

function postProcessEvents(
  rawEvents: Event[],
  filterPredicate: ((event: Event) => boolean) | undefined,
  limit: number
) {
  const dedupMap = new Map<string, Event>()
  rawEvents.forEach((evt) => {
    if (!dedupMap.has(evt.id)) {
      dedupMap.set(evt.id, evt)
    }
  })

  let events = Array.from(dedupMap.values())
  if (filterPredicate) {
    events = events.filter(filterPredicate)
  }
  events.sort((a, b) => b.created_at - a.created_at)
  return events.slice(0, limit)
}

export function useProfileTimeline({
  pubkey,
  cacheKey,
  kinds,
  limit = 200,
  filterPredicate
}: UseProfileTimelineOptions): UseProfileTimelineResult {
  const cachedEntry = useMemo(() => timelineCache.get(cacheKey), [cacheKey])
  const [events, setEvents] = useState<Event[]>(cachedEntry?.events ?? [])
  const [isLoading, setIsLoading] = useState(!cachedEntry)
  const [refreshToken, setRefreshToken] = useState(0)
  const subscriptionRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    const refreshIndex = refreshToken

    const subscribe = async () => {
      setIsLoading(!timelineCache.has(cacheKey))
      try {
        const relayGroups = await getRelayGroups(pubkey)
        if (cancelled) {
          return
        }

        const subRequests = relayGroups
          .map((urls) => ({
            urls,
            filter: {
              authors: [pubkey],
              kinds,
              limit
            } as any
          }))
          .filter((request) => request.urls.length)

        if (!subRequests.length) {
          updateCache([])
          setIsLoading(false)
          return
        }

        const { closer } = await client.subscribeTimeline(
          subRequests,
          {
            onEvents: (fetchedEvents) => {
              if (cancelled) return
              const processed = postProcessEvents(fetchedEvents as Event[], filterPredicate, limit)
              timelineCache.set(cacheKey, {
                events: processed,
                lastUpdated: Date.now()
              })
              setEvents(processed)
              setIsLoading(false)
            },
            onNew: (evt) => {
              if (cancelled) return
              setEvents((prevEvents) => {
                const combined = [evt as Event, ...prevEvents]
                const processed = postProcessEvents(combined, filterPredicate, limit)
                timelineCache.set(cacheKey, {
                  events: processed,
                  lastUpdated: Date.now()
                })
                return processed
              })
            }
          },
          { needSort: true }
        )

        subscriptionRef.current = () => closer()
      } catch (error) {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    subscribe()

    return () => {
      cancelled = true
      subscriptionRef.current()
      subscriptionRef.current = () => {}
    }
  }, [pubkey, cacheKey, JSON.stringify(kinds), limit, filterPredicate, refreshToken])

  const refresh = useCallback(() => {
    subscriptionRef.current()
    subscriptionRef.current = () => {}
    timelineCache.delete(cacheKey)
    setIsLoading(true)
    setRefreshToken((token) => token + 1)
  }, [])

  return {
    events,
    isLoading,
    refresh
  }
}

