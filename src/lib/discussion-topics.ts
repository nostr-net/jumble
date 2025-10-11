import { HASHTAG_REGEX } from '@/constants'
import { NostrEvent } from 'nostr-tools'

/**
 * Normalize a topic string to lowercase with hyphens, no spaces
 * Also converts plurals to singular form
 */
export function normalizeTopic(topic: string): string {
  let normalized = topic
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  
  // Convert plural to singular (simple English plurals)
  // Handle common cases: -ies -> -y, -es -> (sometimes), -s -> remove
  if (normalized.endsWith('ies') && normalized.length > 4) {
    // cities -> city, berries -> berry
    normalized = normalized.slice(0, -3) + 'y'
  } else if (normalized.endsWith('ves') && normalized.length > 4) {
    // wives -> wife, knives -> knife
    normalized = normalized.slice(0, -3) + 'fe'
  } else if (normalized.endsWith('ses') && normalized.length > 4) {
    // classes -> class, bosses -> boss
    normalized = normalized.slice(0, -2)
  } else if (normalized.endsWith('xes') && normalized.length > 4) {
    // boxes -> box
    normalized = normalized.slice(0, -2)
  } else if (normalized.endsWith('shes') && normalized.length > 5) {
    // dishes -> dish
    normalized = normalized.slice(0, -2)
  } else if (normalized.endsWith('ches') && normalized.length > 5) {
    // churches -> church
    normalized = normalized.slice(0, -2)
  } else if (normalized.endsWith('s') && normalized.length > 2) {
    // Simple plural: cats -> cat, bitcoins -> bitcoin
    // But avoid removing 's' from words that naturally end in 's'
    // Check if second-to-last character is not 's' to avoid "ss" words
    const secondLast = normalized[normalized.length - 2]
    if (secondLast !== 's') {
      normalized = normalized.slice(0, -1)
    }
  }
  
  return normalized
}

/**
 * Extract hashtags from content
 */
export function extractHashtagsFromContent(content: string): string[] {
  const matches = content.matchAll(HASHTAG_REGEX)
  const hashtags: string[] = []
  
  for (const match of matches) {
    // Remove the # prefix and normalize
    const tag = match[0].substring(1)
    hashtags.push(normalizeTopic(tag))
  }
  
  return hashtags
}

/**
 * Extract t-tags from event tags
 */
export function extractTTagsFromEvent(event: NostrEvent): string[] {
  return event.tags
    .filter(tag => tag[0] === 't' && tag[1])
    .map(tag => normalizeTopic(tag[1]))
}

/**
 * Extract all topics (both hashtags and t-tags) from an event
 */
export function extractAllTopics(event: NostrEvent): string[] {
  const hashtags = extractHashtagsFromContent(event.content)
  const tTags = extractTTagsFromEvent(event)
  
  // Combine and deduplicate
  const allTopics = [...new Set([...hashtags, ...tTags])]
  
  return allTopics
}

/**
 * Group threads by their primary topic and collect subtopic statistics
 */
export interface TopicAnalysis {
  primaryTopic: string
  subtopics: Map<string, Set<string>> // subtopic -> set of npubs
  threads: NostrEvent[]
}

export function analyzeThreadTopics(
  threads: NostrEvent[],
  availableTopicIds: string[]
): Map<string, TopicAnalysis> {
  const topicMap = new Map<string, TopicAnalysis>()
  
  for (const thread of threads) {
    const allTopics = extractAllTopics(thread)
    
    
    // Find the primary topic (first match from available topics)
    let primaryTopic = 'general'
    for (const topic of allTopics) {
      if (availableTopicIds.includes(topic)) {
        primaryTopic = topic
        break
      }
    }
    
    // Get or create topic analysis
    if (!topicMap.has(primaryTopic)) {
      topicMap.set(primaryTopic, {
        primaryTopic,
        subtopics: new Map(),
        threads: []
      })
    }
    
    const analysis = topicMap.get(primaryTopic)!
    analysis.threads.push(thread)
    
    // Track subtopics (all topics except the primary one and 'all'/'all-topics')
    // For 'general' topic, include all other topics as subtopics
    // Special case: Always include 'readings' as a subtopic for literature threads
    let subtopics = allTopics.filter(
      t => t !== primaryTopic && t !== 'all' && t !== 'all-topics'
    )
    
    // Special handling for literature threads with 'readings' hashtag
    if (primaryTopic === 'literature' && allTopics.includes('readings')) {
      // Ensure 'readings' is included as a subtopic
      if (!subtopics.includes('readings')) {
        subtopics.push('readings')
      }
    }
    
    for (const subtopic of subtopics) {
      if (!analysis.subtopics.has(subtopic)) {
        analysis.subtopics.set(subtopic, new Set())
      }
      analysis.subtopics.get(subtopic)!.add(thread.pubkey)
    }
  }
  
  return topicMap
}

/**
 * Get dynamic subtopics for a given main topic
 * Returns subtopics that have been used by more than minNpubs unique npubs
 */
export function getDynamicSubtopics(
  analysis: TopicAnalysis | undefined,
  minNpubs: number = 3
): string[] {
  if (!analysis) return []
  
  const subtopics: string[] = []
  
  
  for (const [subtopic, npubs] of analysis.subtopics.entries()) {
    if (npubs.size >= minNpubs) {
      subtopics.push(subtopic)
    }
  }
  
  // Sort alphabetically
  return subtopics.sort()
}

/**
 * Check if a thread matches a specific subtopic
 */
export function threadMatchesSubtopic(
  thread: NostrEvent,
  subtopic: string
): boolean {
  const allTopics = extractAllTopics(thread)
  return allTopics.includes(subtopic)
}

/**
 * Get the categorized topic for a thread
 */
export function getCategorizedTopic(
  thread: NostrEvent,
  availableTopicIds: string[]
): string {
  const allTopics = extractAllTopics(thread)
  
  // Find the first matching topic from available topics
  for (const topic of allTopics) {
    if (availableTopicIds.includes(topic)) {
      return topic
    }
  }
  
  return 'general'
}

