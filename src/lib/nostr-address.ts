/**
 * Utility functions for handling nostr addresses
 */

/**
 * Regex pattern for matching nostr addresses that don't already have a prefix
 * Matches npub, nprofile, note, nevent, naddr, nrelay patterns
 */
const NOSTR_ADDRESS_REGEX = /\b(npub|nprofile|note|nevent|naddr|nrelay)1[a-z0-9]+/gi

/**
 * Prefixes nostr addresses with "nostr:" if they don't already have a prefix
 * @param content - The content to process
 * @returns The content with nostr addresses properly prefixed
 */
export function prefixNostrAddresses(content: string): string {
  return content.replace(NOSTR_ADDRESS_REGEX, (match) => {
    // Check if it already has a prefix (nostr: or other protocol)
    const beforeMatch = content.substring(0, content.indexOf(match))
    const lastSpace = beforeMatch.lastIndexOf(' ')
    const lastNewline = beforeMatch.lastIndexOf('\n')
    const lastDelimiter = Math.max(lastSpace, lastNewline)
    
    if (lastDelimiter >= 0) {
      const prefix = content.substring(lastDelimiter + 1, content.indexOf(match))
      // If it already has nostr: prefix, don't add another
      if (prefix.includes('nostr:')) {
        return match
      }
    }
    
    // Add nostr: prefix
    return `nostr:${match}`
  })
}

/**
 * Checks if a string contains nostr addresses that need prefixing
 * @param content - The content to check
 * @returns True if the content contains unprefixed nostr addresses
 */
export function containsUnprefixedNostrAddresses(content: string): boolean {
  return NOSTR_ADDRESS_REGEX.test(content)
}

/**
 * Extracts all nostr addresses from content (both prefixed and unprefixed)
 * @param content - The content to extract addresses from
 * @returns Array of nostr addresses found
 */
export function extractNostrAddresses(content: string): string[] {
  // Reset regex state
  NOSTR_ADDRESS_REGEX.lastIndex = 0
  
  const addresses: string[] = []
  let match
  
  while ((match = NOSTR_ADDRESS_REGEX.exec(content)) !== null) {
    addresses.push(match[0])
  }
  
  // Also check for already prefixed addresses
  const prefixedRegex = /\bnostr:(npub|nprofile|note|nevent|naddr|nrelay)1[a-z0-9]+/gi
  prefixedRegex.lastIndex = 0
  
  while ((match = prefixedRegex.exec(content)) !== null) {
    addresses.push(match[0])
  }
  
  return addresses
}
