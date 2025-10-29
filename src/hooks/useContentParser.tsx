/**
 * React hook for content parsing
 */

import { useState, useEffect } from 'react'
import { Event } from 'nostr-tools'
import { contentParserService, ParsedContent, ParseOptions } from '@/services/content-parser.service'

export interface UseContentParserOptions extends ParseOptions {
  autoParse?: boolean
}

export interface UseContentParserReturn {
  parsedContent: ParsedContent | null
  isLoading: boolean
  error: Error | null
  parse: () => Promise<void>
}

/**
 * Hook for parsing content with automatic detection and processing
 */
export function useContentParser(
  content: string,
  options: UseContentParserOptions = {}
): UseContentParserReturn {
  const { autoParse = true, ...parseOptions } = options
  const [parsedContent, setParsedContent] = useState<ParsedContent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const parse = async () => {
    if (!content.trim()) {
      setParsedContent(null)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const result = await contentParserService.parseContent(content, parseOptions)
      setParsedContent(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown parsing error'))
      setParsedContent(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (autoParse) {
      parse()
    }
  }, [content, autoParse, JSON.stringify(parseOptions)])

  return {
    parsedContent,
    isLoading,
    error,
    parse
  }
}

/**
 * Hook for parsing Nostr event fields
 */
export function useEventFieldParser(
  event: Event,
  field: 'content' | 'title' | 'summary' | 'description',
  options: Omit<UseContentParserOptions, 'eventKind' | 'field'> = {}
): UseContentParserReturn {
  const [parsedContent, setParsedContent] = useState<ParsedContent | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const { autoParse = true, ...parseOptions } = options

  const parse = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const result = await contentParserService.parseEventField(event, field, parseOptions)
      setParsedContent(result)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown parsing error'))
      setParsedContent(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (autoParse) {
      parse()
    }
  }, [event.id, field, autoParse, JSON.stringify(parseOptions)])

  return {
    parsedContent,
    isLoading,
    error,
    parse
  }
}

/**
 * Hook for parsing multiple event fields at once
 */
export function useEventFieldsParser(
  event: Event,
  fields: Array<'content' | 'title' | 'summary' | 'description'>,
  options: Omit<UseContentParserOptions, 'eventKind' | 'field'> = {}
) {
  const [parsedFields, setParsedFields] = useState<Record<string, ParsedContent | null>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const { autoParse = true, ...parseOptions } = options

  const parse = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const results: Record<string, ParsedContent | null> = {}
      
      for (const field of fields) {
        const result = await contentParserService.parseEventField(event, field, parseOptions)
        results[field] = result
      }
      
      setParsedFields(results)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown parsing error'))
      setParsedFields({})
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (autoParse) {
      parse()
    }
  }, [event.id, JSON.stringify(fields), autoParse, JSON.stringify(parseOptions)])

  return {
    parsedFields,
    isLoading,
    error,
    parse
  }
}
