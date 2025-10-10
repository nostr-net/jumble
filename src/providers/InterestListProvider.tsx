import { createInterestListDraftEvent } from '@/lib/draft-event'
import { normalizeTopic } from '@/lib/discussion-topics'
import client from '@/services/client.service'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useNostr } from './NostrProvider'

type TInterestListContext = {
  subscribedTopics: Set<string>
  changing: boolean
  isSubscribed: (topic: string) => boolean
  subscribe: (topic: string) => Promise<void>
  unsubscribe: (topic: string) => Promise<void>
  getSubscribedTopics: () => string[]
}

const InterestListContext = createContext<TInterestListContext | undefined>(undefined)

export const useInterestList = () => {
  const context = useContext(InterestListContext)
  if (!context) {
    throw new Error('useInterestList must be used within an InterestListProvider')
  }
  return context
}

export function InterestListProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const { pubkey: accountPubkey, interestListEvent, publish, updateInterestListEvent } = useNostr()
  const [topics, setTopics] = useState<string[]>([])
  const subscribedTopics = useMemo(() => new Set(topics), [topics])
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    const updateTopics = () => {
      if (!interestListEvent) {
        setTopics([])
        return
      }

      // Extract t-tags from the interest list
      const topicTags = interestListEvent.tags
        .filter(tag => tag[0] === 't' && tag[1])
        .map(tag => normalizeTopic(tag[1]))
      
      setTopics(topicTags)
    }
    updateTopics()
  }, [interestListEvent])

  const getSubscribedTopics = useCallback(() => {
    return Array.from(subscribedTopics)
  }, [subscribedTopics])

  const isSubscribed = useCallback(
    (topic: string): boolean => {
      return subscribedTopics.has(normalizeTopic(topic))
    },
    [subscribedTopics]
  )

  const publishNewInterestListEvent = async (newTopics: string[]) => {
    const newInterestListEvent = createInterestListDraftEvent(newTopics)
    const publishedEvent = await publish(newInterestListEvent)
    return publishedEvent
  }

  const subscribe = async (topic: string) => {
    if (!accountPubkey || changing) return

    const normalizedTopic = normalizeTopic(topic)
    if (subscribedTopics.has(normalizedTopic)) {
      return
    }

    setChanging(true)
    try {
      const interestListEvent = await client.fetchInterestListEvent(accountPubkey)
      const currentTopics = interestListEvent
        ? interestListEvent.tags
            .filter(tag => tag[0] === 't' && tag[1])
            .map(tag => normalizeTopic(tag[1]))
        : []

      if (currentTopics.includes(normalizedTopic)) {
        // Already subscribed
        return
      }

      const newTopics = [...currentTopics, normalizedTopic]
      const newInterestListEvent = await publishNewInterestListEvent(newTopics)
      await updateInterestListEvent(newInterestListEvent)
      
      toast.success(t('Subscribed to topic'))
    } catch (error) {
      console.error('Failed to subscribe to topic:', error)
      toast.error(t('Failed to subscribe to topic') + ': ' + (error as Error).message)
    } finally {
      setChanging(false)
    }
  }

  const unsubscribe = async (topic: string) => {
    if (!accountPubkey || changing) return

    const normalizedTopic = normalizeTopic(topic)
    if (!subscribedTopics.has(normalizedTopic)) {
      return
    }

    setChanging(true)
    try {
      const interestListEvent = await client.fetchInterestListEvent(accountPubkey)
      if (!interestListEvent) return

      const currentTopics = interestListEvent.tags
        .filter(tag => tag[0] === 't' && tag[1])
        .map(tag => normalizeTopic(tag[1]))

      const newTopics = currentTopics.filter(t => t !== normalizedTopic)
      
      if (newTopics.length === currentTopics.length) {
        // Topic wasn't in the list
        return
      }

      const newInterestListEvent = await publishNewInterestListEvent(newTopics)
      await updateInterestListEvent(newInterestListEvent)
      
      toast.success(t('Unsubscribed from topic'))
    } catch (error) {
      console.error('Failed to unsubscribe from topic:', error)
      toast.error(t('Failed to unsubscribe from topic') + ': ' + (error as Error).message)
    } finally {
      setChanging(false)
    }
  }

  return (
    <InterestListContext.Provider
      value={{
        subscribedTopics,
        changing,
        isSubscribed,
        subscribe,
        unsubscribe,
        getSubscribedTopics
      }}
    >
      {children}
    </InterestListContext.Provider>
  )
}

