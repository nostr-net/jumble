import { Event, kinds } from 'nostr-tools'
import { ExtendedKind } from '@/constants'
import { FAST_WRITE_RELAY_URLS } from '@/constants'
import client from '@/services/client.service'
import { normalizeUrl, isLocalNetworkUrl } from '@/lib/url'
import { TRelaySet } from '@/types'

export interface RelaySelectionContext {
  // User's own relays
  userWriteRelays: string[]
  userReadRelays: string[]
  favoriteRelays: string[]
  blockedRelays: string[]
  relaySets: TRelaySet[]
  
  // Post context
  parentEvent?: Event
  isPublicMessage?: boolean
  content?: string
  userPubkey?: string
  openFrom?: string[]
}

export interface RelaySelectionResult {
  selectableRelays: string[]
  selectedRelays: string[]
  description: string
}

class RelaySelectionService {
  /**
   * Filter out local network relays from other users' relay lists
   * We should only use our own local relays, not other users' local relays
   */
  private filterLocalRelaysFromOthers(relays: string[], isOwnRelays: boolean = false): string[] {
    if (isOwnRelays) {
      // For our own relays, keep all of them including local ones
      return relays
    }
    
    // For other users' relays, filter out local network relays
    return relays.filter(relay => !isLocalNetworkUrl(relay))
  }

  /**
   * Main entry point for relay selection logic
   */
  async selectRelays(context: RelaySelectionContext): Promise<RelaySelectionResult> {
    // Step 1: Build the list of selectable relays
    const selectableRelays = await this.buildSelectableRelays(context)
    
    // Step 2: Determine which relays should be selected (checked)
    const selectedRelays = await this.determineSelectedRelays(context, selectableRelays)
    
    // Step 3: Generate description
    const description = this.generateDescription(selectedRelays)

    return {
      selectableRelays,
      selectedRelays,
      description
    }
  }

  /**
   * Build the list of all relays that can be selected
   * Always includes: user's write relays (or fast write fallback) + favorite relays + relay sets
   * Plus contextual relays for replies and public messages
   */
  private async buildSelectableRelays(context: RelaySelectionContext): Promise<string[]> {
    const {
      userWriteRelays,
      favoriteRelays,
      relaySets,
      parentEvent,
      isPublicMessage,
      openFrom
    } = context

    const selectableRelays = new Set<string>()

    // Helper function to safely add normalized URLs
    const addRelay = (url: string) => {
      if (!url) return
      const normalized = normalizeUrl(url)
      if (normalized) {
        selectableRelays.add(normalized)
      } else {
        // If normalization fails, add the original URL but log a warning
        console.warn('Failed to normalize relay URL:', url)
        selectableRelays.add(url)
      }
    }

    // Always include user's write relays (or fallback to fast write relays)
    const userRelays = userWriteRelays.length > 0 ? userWriteRelays : FAST_WRITE_RELAY_URLS
    userRelays.forEach(addRelay)

    // Always include favorite relays
    favoriteRelays.forEach(addRelay)

    // Always include relays from relay sets
    relaySets.forEach(set => {
      set.relayUrls.forEach(addRelay)
    })

    // Add contextual relays for replies and public messages
    if (parentEvent || isPublicMessage) {
      const contextualRelays = await this.getContextualRelays(context)
      contextualRelays.forEach(addRelay)
    }

    // If called with specific relay URLs (e.g., from openFrom), include those
    if (openFrom && openFrom.length > 0) {
      openFrom.forEach(addRelay)
    }

    // Filter out blocked relays and return deduplicated list
    const deduplicatedRelays = Array.from(selectableRelays).filter(Boolean)
    return this.filterBlockedRelays(deduplicatedRelays, context.blockedRelays)
  }

  /**
   * Get contextual relays based on the type of post
   */
  private async getContextualRelays(context: RelaySelectionContext): Promise<string[]> {
    const { parentEvent, isPublicMessage, content, userPubkey } = context
    const contextualRelays = new Set<string>()


    try {
      // For replies (any kind) and public messages
      if (parentEvent || isPublicMessage) {
        // Get the replied-to author's read relays (filter out their local relays)
        if (parentEvent) {
          const authorRelayList = await client.fetchRelayList(parentEvent.pubkey)
          if (authorRelayList?.read) {
            const filteredRelays = this.filterLocalRelaysFromOthers(authorRelayList.read)
            filteredRelays.slice(0, 4).forEach(url => contextualRelays.add(url))
          }
        }

        // Get relay hint from where the event was discovered
        if (parentEvent) {
          const eventHints = client.getEventHints(parentEvent.id)
          eventHints.forEach(url => contextualRelays.add(url))
        }

        // For replies and public messages, get mentioned users' relays
        if (userPubkey) {
          let mentions: string[] = []
          
          // Always include parent event author for replies
          if (parentEvent) {
            mentions.push(parentEvent.pubkey)
          }
          
          // Extract additional mentions from content if available
          if (content) {
            const contentMentions = await this.extractMentions(content, parentEvent)
            mentions = [...new Set([...mentions, ...contentMentions])] // deduplicate
          }
          
          const mentionedPubkeys = mentions.filter(p => p !== userPubkey)
          
          
          if (mentionedPubkeys.length > 0) {
            const mentionRelayLists = await Promise.all(
              mentionedPubkeys.map(async (pubkey) => {
                try {
                  const relayList = await client.fetchRelayList(pubkey)
                  // Use write relays for replies, read relays for public messages
                  const relayType = isPublicMessage ? 'read' : 'write'
                  const userRelays = relayList?.[relayType] || []
                  // Filter out local relays from other users
                  return this.filterLocalRelaysFromOthers(userRelays)
                } catch (error) {
                  console.warn(`Failed to fetch relay list for ${pubkey}:`, error)
                  return []
                }
              })
            )
            mentionRelayLists.flat().forEach(url => contextualRelays.add(url))
          }
        }
      }
    } catch (error) {
      console.error('Failed to get contextual relays:', error)
    }

    return Array.from(contextualRelays)
  }

  /**
   * Determine which relays should be selected (checked) based on the context
   */
  private async determineSelectedRelays(
    context: RelaySelectionContext,
    _selectableRelays: string[]
  ): Promise<string[]> {
    const {
      userWriteRelays,
      parentEvent,
      isPublicMessage,
      openFrom,
      content,
      userPubkey
    } = context

    let selectedRelays: string[] = []

    // If called with specific relay URLs, use those
    if (openFrom && openFrom.length > 0) {
      selectedRelays = openFrom.map(url => normalizeUrl(url) || url).filter(Boolean)
      // Deduplicate the selected relays
      selectedRelays = Array.from(new Set(selectedRelays))
    }
    // For discussion replies, use relay hint from the kind 11 at the top of the thread
    else if (parentEvent && (parentEvent.kind === ExtendedKind.DISCUSSION || parentEvent.kind === ExtendedKind.COMMENT)) {
      const discussionRelay = this.getDiscussionRelayHint(parentEvent)
      if (discussionRelay) {
        selectedRelays = [discussionRelay]
      }
    }
    // For public messages, use sender outboxes + receiver inboxes
    else if (isPublicMessage || (parentEvent && parentEvent.kind === ExtendedKind.PUBLIC_MESSAGE)) {
      selectedRelays = await this.getPublicMessageRelays(context)
    }
    // For regular replies, use user's write relays + mention relays
    else if (parentEvent && this.isRegularReply(parentEvent)) {
      // Get user's write relays
      const userRelays = userWriteRelays.length > 0 ? userWriteRelays : FAST_WRITE_RELAY_URLS
      selectedRelays = userRelays.map(url => normalizeUrl(url) || url).filter(Boolean)
      // Deduplicate the selected relays
      selectedRelays = Array.from(new Set(selectedRelays))
      
      // Add mention relays
      if (userPubkey) {
        let mentions: string[] = []
        
        // Always include parent event author for replies
        if (parentEvent) {
          mentions.push(parentEvent.pubkey)
        }
        
        // Extract additional mentions from content if available
        if (content) {
          const contentMentions = await this.extractMentions(content, parentEvent)
          mentions = [...new Set([...mentions, ...contentMentions])] // deduplicate
        }
        
        const mentionedPubkeys = mentions.filter(p => p !== userPubkey)
        
        if (mentionedPubkeys.length > 0) {
          const mentionRelayLists = await Promise.all(
            mentionedPubkeys.map(async (pubkey) => {
              try {
                const relayList = await client.fetchRelayList(pubkey)
                const userRelays = relayList?.write || []
                // Filter out local relays from other users
                return this.filterLocalRelaysFromOthers(userRelays)
              } catch (error) {
                console.warn(`Failed to fetch relay list for ${pubkey}:`, error)
                return []
              }
            })
          )
          const mentionRelays = mentionRelayLists.flat().map(url => normalizeUrl(url) || url).filter(Boolean)
          selectedRelays = [...selectedRelays, ...mentionRelays]
          // Deduplicate after adding mention relays
          selectedRelays = Array.from(new Set(selectedRelays))
        }
      }
    }
    // Default: user's write relays (or fallback to fast write relays if no user relays)
    else {
      const defaultRelays = userWriteRelays.length > 0 ? userWriteRelays : FAST_WRITE_RELAY_URLS
      selectedRelays = defaultRelays.map(url => normalizeUrl(url) || url).filter(Boolean)
      // Deduplicate the selected relays
      selectedRelays = Array.from(new Set(selectedRelays))
    }

    // Filter out blocked relays
    return this.filterBlockedRelays(selectedRelays, context.blockedRelays)
  }

  /**
   * Get relays for public messages: sender outboxes + receiver inboxes
   */
  private async getPublicMessageRelays(context: RelaySelectionContext): Promise<string[]> {
    const { userWriteRelays, parentEvent, isPublicMessage, content, userPubkey } = context
    const relays = new Set<string>()

    try {
      // Add sender's write relays (outboxes) - fallback to fast write relays if no user relays
      const senderRelays = userWriteRelays.length > 0 ? userWriteRelays : FAST_WRITE_RELAY_URLS
      senderRelays.forEach(url => {
        const normalized = normalizeUrl(url)
        if (normalized) {
          relays.add(normalized)
        } else {
          relays.add(url)
        }
      })

      // Add receiver's read relays (inboxes)
      if (isPublicMessage && content && userPubkey) {
        // For new public messages, get mentioned users' read relays
        const mentions = await this.extractMentions(content, parentEvent)
        const mentionedPubkeys = mentions.filter(p => p !== userPubkey)
        
        if (mentionedPubkeys.length > 0) {
          const receiverRelayLists = await Promise.all(
            mentionedPubkeys.map(async (pubkey) => {
              try {
                const relayList = await client.fetchRelayList(pubkey)
                const userRelays = relayList?.read || []
                // Filter out local relays from other users
                return this.filterLocalRelaysFromOthers(userRelays)
              } catch (error) {
                console.warn(`Failed to fetch relay list for ${pubkey}:`, error)
                return []
              }
            })
          )
          receiverRelayLists.flat().forEach(url => {
            const normalized = normalizeUrl(url)
            if (normalized) {
              relays.add(normalized)
            } else {
              relays.add(url)
            }
          })
        }
      } else if (parentEvent && parentEvent.kind === ExtendedKind.PUBLIC_MESSAGE) {
        // For public message replies, get original sender's read relays (filter out their local relays)
        try {
          const senderRelayList = await client.fetchRelayList(parentEvent.pubkey)
          if (senderRelayList?.read) {
            const filteredRelays = this.filterLocalRelaysFromOthers(senderRelayList.read)
            filteredRelays.forEach(url => {
              const normalized = normalizeUrl(url)
              if (normalized) {
                relays.add(normalized)
              } else {
                relays.add(url)
              }
            })
          }
        } catch (error) {
          console.warn(`Failed to fetch relay list for ${parentEvent.pubkey}:`, error)
        }
      }
    } catch (error) {
      console.error('Failed to get public message relays:', error)
    }

    return Array.from(relays)
  }


  /**
   * Check if this is a regular reply (Kind 1 or Kind 1111, not to Kind 11)
   */
  private isRegularReply(parentEvent: Event): boolean {
    return (parentEvent.kind === kinds.ShortTextNote || parentEvent.kind === ExtendedKind.COMMENT) &&
           parentEvent.kind !== ExtendedKind.DISCUSSION
  }

  /**
   * Get relay hint from discussion events
   */
  private getDiscussionRelayHint(parentEvent: Event): string | null {
    // For kind 1111 (COMMENT): look for 'E' tag which points to the root event
    if (parentEvent.kind === ExtendedKind.COMMENT) {
      const ETag = parentEvent.tags.find(tag => tag[0] === 'E')
      if (ETag && ETag[2]) {
        return normalizeUrl(ETag[2]) || ETag[2]
      }
      
      // If no 'E' tag, check lowercase 'e' tag for parent event
      const eTag = parentEvent.tags.find(tag => tag[0] === 'e')
      if (eTag && eTag[2]) {
        return normalizeUrl(eTag[2]) || eTag[2]
      }
    } else if (parentEvent.kind === ExtendedKind.DISCUSSION) {
      // For kind 11 (DISCUSSION): get relay hint from where it was found
      const eventHints = client.getEventHints(parentEvent.id)
      if (eventHints.length > 0) {
        return normalizeUrl(eventHints[0]) || eventHints[0]
      }
    }

    return null
  }

  /**
   * Extract mentions from content (simplified version of the existing extractMentions)
   */
  private async extractMentions(content: string, parentEvent?: Event): Promise<string[]> {
    const pubkeys: string[] = []
    
    // Always include parent event author if there's a parent event
    if (parentEvent) {
      pubkeys.push(parentEvent.pubkey)
    }
    
    // Extract nostr addresses from content
    const matches = content.match(
      /nostr:(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+|note1[a-z0-9]{58}|nevent1[a-z0-9]+)/g
    )


    if (matches) {
      for (const match of matches) {
        try {
          const { nip19 } = await import('nostr-tools')
          const id = match.split(':')[1]
          const { type, data } = nip19.decode(id)
          if (type === 'nprofile') {
            if (!pubkeys.includes(data.pubkey)) {
              pubkeys.push(data.pubkey)
            }
          } else if (type === 'npub') {
            if (!pubkeys.includes(data)) {
              pubkeys.push(data)
            }
          } else if (['nevent', 'note'].includes(type)) {
            const event = await client.fetchEvent(id)
            if (event && !pubkeys.includes(event.pubkey)) {
              pubkeys.push(event.pubkey)
            }
          }
        } catch (error) {
          console.error('Failed to decode nostr address:', error)
        }
      }
    }

    // Add related pubkeys from parent event tags
    if (parentEvent) {
      parentEvent.tags.forEach(([tagName, tagValue]) => {
        if (['p', 'P'].includes(tagName) && tagValue && !pubkeys.includes(tagValue)) {
          pubkeys.push(tagValue)
        }
      })
    }

    return pubkeys
  }

  /**
   * Generate description for the selected relays
   */
  private generateDescription(selectedRelays: string[]): string {
    if (selectedRelays.length === 0) {
      return 'No relays selected'
    }
    if (selectedRelays.length === 1) {
      return this.simplifyUrl(selectedRelays[0])
    }
    return `${selectedRelays.length} relays`
  }

  /**
   * Simplify URL for display
   */
  private simplifyUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return url
    }
  }

  /**
   * Filter out blocked relays from a list
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
}

const relaySelectionService = new RelaySelectionService()
export default relaySelectionService
