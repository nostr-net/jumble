import { Event } from 'nostr-tools'
import nip89Service from '@/services/nip89.service'

/**
 * Create the Jumble ImWald application handler info event (kind 31990)
 * This can be published using the existing publish function from NostrProvider
 */
export function createJumbleImWaldHandlerInfoEvent(pubkey: string): Omit<Event, 'id' | 'sig'> {
  return nip89Service.createJumbleImWaldHandlerInfo(pubkey)
}

/**
 * Example usage in a component:
 * 
 * const { pubkey, signEvent, publish } = useNostr()
 * 
 * const handlePublishHandlerInfo = async () => {
 *   if (!pubkey) return
 *   
 *   const handlerInfoEvent = createJumbleImWaldHandlerInfoEvent(pubkey)
 *   const signedEvent = await signEvent(handlerInfoEvent)
 *   await publish(signedEvent)
 * }
 */
