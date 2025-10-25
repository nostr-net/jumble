import NormalFeed from '@/components/NormalFeed'
import { checkAlgoRelay } from '@/lib/relay'
import { useFeed } from '@/providers/FeedProvider'
import relayInfoService from '@/services/relay-info.service'
import { useEffect, useState } from 'react'

export default function RelaysFeed() {
  console.log('RelaysFeed component rendering')
  const { feedInfo, relayUrls } = useFeed()
  const [isReady, setIsReady] = useState(false)
  const [areAlgoRelays, setAreAlgoRelays] = useState(false)

  // Debug logging
  console.log('RelaysFeed debug:', {
    feedInfo,
    relayUrls,
    isReady
  })

  useEffect(() => {
    const init = async () => {
      const relayInfos = await relayInfoService.getRelayInfos(relayUrls)
      setAreAlgoRelays(relayInfos.every((relayInfo) => checkAlgoRelay(relayInfo)))
      setIsReady(true)
    }
    init()
  }, [relayUrls])

  if (!isReady) {
    return null
  }

  if (feedInfo.feedType !== 'relay' && feedInfo.feedType !== 'relays' && feedInfo.feedType !== 'all-favorites') {
    return null
  }

  const subRequests = [{ urls: relayUrls, filter: {} }]
  console.log('RelaysFeed rendering NormalFeed with:', { subRequests, relayUrls, areAlgoRelays })

  return (
    <NormalFeed
      subRequests={subRequests}
      areAlgoRelays={areAlgoRelays}
      isMainFeed
      showRelayCloseReason
    />
  )
}
