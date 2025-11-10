import { useSecondaryPage, useSmartHashtagNavigation, useSmartRelayNavigation } from '@/PageManager'
import Image from '@/components/Image'
import MediaPlayer from '@/components/MediaPlayer'
import Wikilink from '@/components/UniversalContent/Wikilink'
import WebPreview from '@/components/WebPreview'
import { getLongFormArticleMetadataFromEvent } from '@/lib/event-metadata'
import { toNoteList } from '@/lib/link'
import { useMediaExtraction } from '@/hooks'
import { cleanUrl, isImage, isMedia, isVideo, isAudio, isWebsocketUrl } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import { Event, kinds } from 'nostr-tools'
import { ExtendedKind, WS_URL_REGEX } from '@/constants'
import React, { useMemo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Lightbox from 'yet-another-react-lightbox'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import { EmbeddedNote, EmbeddedMention } from '@/components/Embedded'
import { preprocessMarkdownMediaLinks } from './preprocessMarkup'

/**
 * Truncate link display text to 200 characters, adding ellipsis if truncated
 */
function truncateLinkText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) {
    return text
  }
  return text.substring(0, maxLength) + '...'
}

/**
 * Parse markdown content and render with post-processing for nostr: links and hashtags
 * Post-processes:
 * - nostr: links -> EmbeddedNote or EmbeddedMention
 * - #hashtags -> green hyperlinks to /notes?t=hashtag
 * - wss:// and ws:// URLs -> hyperlinks to /relays/{url}
 * Returns both rendered nodes and a set of hashtags found in content (for deduplication)
 */
function parseMarkdownContent(
  content: string,
  options: {
    eventPubkey: string
    imageIndexMap: Map<string, number>
    openLightbox: (index: number) => void
    navigateToHashtag: (href: string) => void
    navigateToRelay: (url: string) => void
  }
): { nodes: React.ReactNode[]; hashtagsInContent: Set<string>; footnotes: Map<string, string> } {
  const { eventPubkey, imageIndexMap, openLightbox, navigateToHashtag, navigateToRelay } = options
  const parts: React.ReactNode[] = []
  const hashtagsInContent = new Set<string>()
  const footnotes = new Map<string, string>()
  let lastIndex = 0
  
  // Find all patterns: markdown images, markdown links, relay URLs, nostr addresses, hashtags, wikilinks
  const patterns: Array<{ index: number; end: number; type: string; data: any }> = []
  
  // Markdown images: ![](url) or ![alt](url)
  const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g
  const imageMatches = Array.from(content.matchAll(markdownImageRegex))
  imageMatches.forEach(match => {
    if (match.index !== undefined) {
      patterns.push({
        index: match.index,
        end: match.index + match[0].length,
        type: 'markdown-image',
        data: { alt: match[1], url: match[2] }
      })
    }
  })
  
  // Markdown links: [text](url) - but not images
    const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const linkMatches = Array.from(content.matchAll(markdownLinkRegex))
  linkMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if this is already an image
      const isImage = content.substring(Math.max(0, match.index - 1), match.index) === '!'
      if (!isImage) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'markdown-link',
          data: { text: match[1], url: match[2] }
        })
      }
    }
  })
  
  // Relay URLs (wss:// or ws://) - not in markdown links
  const relayUrlMatches = Array.from(content.matchAll(WS_URL_REGEX))
  relayUrlMatches.forEach(match => {
    if (match.index !== undefined) {
      const url = match[0]
      // Only add if not already covered by a markdown link/image
      const isInMarkdown = patterns.some(p => 
        (p.type === 'markdown-link' || p.type === 'markdown-image') && 
        match.index! >= p.index && 
        match.index! < p.end
      )
      // Only process valid websocket URLs
      if (!isInMarkdown && isWebsocketUrl(url)) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'relay-url',
          data: { url }
        })
      }
    }
  })
  
  // Nostr addresses (nostr:npub1..., nostr:note1..., etc.) - not in markdown links or relay URLs
  const nostrRegex = /nostr:(npub1[a-z0-9]{58}|nprofile1[a-z0-9]+|note1[a-z0-9]{58}|nevent1[a-z0-9]+|naddr1[a-z0-9]+)/g
  const nostrMatches = Array.from(content.matchAll(nostrRegex))
  nostrMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by a markdown link/image or relay URL
      const isInOther = patterns.some(p => 
        (p.type === 'markdown-link' || p.type === 'markdown-image' || p.type === 'relay-url') && 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'nostr',
          data: match[1]
        })
      }
    }
  })
  
  // Hashtags (#tag) - but not inside markdown links, relay URLs, or nostr addresses
  const hashtagRegex = /#([a-zA-Z0-9_]+)/g
  const hashtagMatches = Array.from(content.matchAll(hashtagRegex))
  hashtagMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by another pattern
      const isInOther = patterns.some(p => 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'hashtag',
          data: match[1]
        })
      }
    }
  })
  
  // Wikilinks ([[link]] or [[link|display]])
  const wikilinkRegex = /\[\[([^\]]+)\]\]/g
  const wikilinkMatches = Array.from(content.matchAll(wikilinkRegex))
  wikilinkMatches.forEach(match => {
    if (match.index !== undefined) {
      // Only add if not already covered by another pattern
      const isInOther = patterns.some(p => 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'wikilink',
          data: match[1]
        })
      }
    }
  })
  
  // Footnote references ([^1], [^note], etc.) - but not definitions
  const footnoteRefRegex = /\[\^([^\]]+)\]/g
  const footnoteRefMatches = Array.from(content.matchAll(footnoteRefRegex))
  footnoteRefMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if this is a footnote definition (has : after the closing bracket)
      const afterMatch = content.substring(match.index + match[0].length, match.index + match[0].length + 2)
      if (afterMatch.startsWith(']:')) {
        return // This is a definition, not a reference
      }
      
      // Only add if not already covered by another pattern
      const isInOther = patterns.some(p => 
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        patterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'footnote-ref',
          data: match[1] // footnote ID
        })
      }
    }
  })
  
  // Block-level patterns: headers, lists, horizontal rules, tables, footnotes - must be at start of line
  // Process line by line to detect block-level elements
  const lines = content.split('\n')
  let currentIndex = 0
  const blockPatterns: Array<{ index: number; end: number; type: string; data: any }> = []
  
  // First pass: extract footnote definitions
  lines.forEach((line) => {
    const footnoteDefMatch = line.match(/^\[\^([^\]]+)\]:\s+(.+)$/)
    if (footnoteDefMatch) {
      const footnoteId = footnoteDefMatch[1]
      const footnoteText = footnoteDefMatch[2]
      footnotes.set(footnoteId, footnoteText)
    }
  })
  
  // Second pass: detect tables and other block-level elements
  let lineIdx = 0
  while (lineIdx < lines.length) {
    const line = lines[lineIdx]
    const lineStartIndex = currentIndex
    const lineEndIndex = currentIndex + line.length
    
    // Tables: detect table rows (must have | characters)
    // GitHub markdown table format: header row, separator row (|---|), data rows
    if (line.includes('|') && line.trim().startsWith('|') && line.trim().endsWith('|')) {
      // Check if this is a table by looking at the next line (separator)
      if (lineIdx + 1 < lines.length) {
        const nextLine = lines[lineIdx + 1]
        const nextLineTrimmed = nextLine.trim()
        // Table separator looks like: |---|---| or |:---|:---:|---:| or | -------- | ------- |
        // Must start and end with |, and contain only spaces, dashes, colons, and pipes
        const isSeparator = nextLineTrimmed.startsWith('|') && 
                           nextLineTrimmed.endsWith('|') &&
                           /^[\|\s\:\-]+$/.test(nextLineTrimmed) &&
                           nextLineTrimmed.includes('-')
        
        if (isSeparator) {
          // This is a table! Collect all table rows
          const tableRows: string[] = []
          const tableStartIndex = lineStartIndex
          let tableEndIndex = lineEndIndex
          let tableLineIdx = lineIdx
          
          // Collect header row
          tableRows.push(line)
          tableLineIdx++
          tableEndIndex += nextLine.length + 1
          tableLineIdx++ // Skip separator
          
          // Collect data rows until we hit a non-table line
          while (tableLineIdx < lines.length) {
            const tableLine = lines[tableLineIdx]
            const tableLineTrimmed = tableLine.trim()
            // Check if it's a table row (starts and ends with |)
            if (tableLineTrimmed.startsWith('|') && tableLineTrimmed.endsWith('|')) {
              // Check if it's another separator row (skip it)
              const isAnotherSeparator = /^[\|\s\:\-]+$/.test(tableLineTrimmed) && tableLineTrimmed.includes('-')
              if (!isAnotherSeparator) {
                tableRows.push(tableLine)
                tableEndIndex += tableLine.length + 1
              }
              tableLineIdx++
            } else {
              break
            }
          }
          
          // Parse table rows into cells
          const parsedRows: string[][] = []
          tableRows.forEach((row) => {
            // Split by |, trim each cell, filter out empty edge cells
            const rawCells = row.split('|')
            const cells = rawCells
              .map(cell => cell.trim())
              .filter((cell, idx) => {
                // Remove empty cells at the very start and end (from leading/trailing |)
                if (idx === 0 && cell === '') return false
                if (idx === rawCells.length - 1 && cell === '') return false
                return true
              })
            if (cells.length > 0) {
              parsedRows.push(cells)
            }
          })
          
          if (parsedRows.length > 0) {
            blockPatterns.push({
              index: tableStartIndex,
              end: tableEndIndex,
              type: 'table',
              data: { rows: parsedRows, lineNum: lineIdx }
            })
            // Skip all table lines
            currentIndex = tableEndIndex + 1
            lineIdx = tableLineIdx
            continue
          }
        }
      }
    }
    
    // Headers (# Header, ## Header, etc.)
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headerMatch) {
      const headerLevel = headerMatch[1].length
      const headerText = headerMatch[2]
      blockPatterns.push({
        index: lineStartIndex,
        end: lineEndIndex,
        type: 'header',
        data: { level: headerLevel, text: headerText, lineNum: lineIdx }
      })
    }
    // Horizontal rule (---- or ====, at least 3 dashes/equals)
    else if (line.match(/^[-=]{3,}\s*$/)) {
      blockPatterns.push({
        index: lineStartIndex,
        end: lineEndIndex,
        type: 'horizontal-rule',
        data: { lineNum: lineIdx }
      })
    }
    // Bullet list (* item or - item)
    else if (line.match(/^[\*\-\+]\s+.+$/)) {
      const listMatch = line.match(/^[\*\-\+]\s+(.+)$/)
      if (listMatch) {
        blockPatterns.push({
          index: lineStartIndex,
          end: lineEndIndex,
          type: 'bullet-list-item',
          data: { text: listMatch[1], lineNum: lineIdx }
        })
      }
    }
    // Numbered list (1. item, 2. item, etc.)
    else if (line.match(/^\d+\.\s+.+$/)) {
      const listMatch = line.match(/^\d+\.\s+(.+)$/)
      if (listMatch) {
        blockPatterns.push({
          index: lineStartIndex,
          end: lineEndIndex,
          type: 'numbered-list-item',
          data: { text: listMatch[1], lineNum: lineIdx, number: line.match(/^(\d+)/)?.[1] }
        })
      }
    }
    // Footnote definition (already extracted, but mark it so we don't render it in content)
    else if (line.match(/^\[\^([^\]]+)\]:\s+.+$/)) {
      blockPatterns.push({
        index: lineStartIndex,
        end: lineEndIndex,
        type: 'footnote-definition',
        data: { lineNum: lineIdx }
      })
    }
    
    currentIndex += line.length + 1 // +1 for newline
    lineIdx++
  }
  
  // Add block patterns to main patterns array
  blockPatterns.forEach(pattern => {
    patterns.push(pattern)
  })
  
  // Sort patterns by index
  patterns.sort((a, b) => a.index - b.index)
  
  // Remove overlapping patterns (keep the first one)
  // Block-level patterns (headers, lists, horizontal rules, tables) take priority
  const filteredPatterns: typeof patterns = []
  const blockLevelTypes = ['header', 'horizontal-rule', 'bullet-list-item', 'numbered-list-item', 'table', 'footnote-definition']
  const blockLevelPatterns = patterns.filter(p => blockLevelTypes.includes(p.type))
  const otherPatterns = patterns.filter(p => !blockLevelTypes.includes(p.type))
  
  // First add all block-level patterns
  blockLevelPatterns.forEach(pattern => {
    filteredPatterns.push(pattern)
  })
  
  // Then add other patterns that don't overlap with block-level patterns
  otherPatterns.forEach(pattern => {
    const overlapsWithBlock = blockLevelPatterns.some(blockPattern =>
      (pattern.index >= blockPattern.index && pattern.index < blockPattern.end) ||
      (pattern.end > blockPattern.index && pattern.end <= blockPattern.end) ||
      (pattern.index <= blockPattern.index && pattern.end >= blockPattern.end)
    )
    if (!overlapsWithBlock) {
      // Check for overlaps with existing filtered patterns
      const overlaps = filteredPatterns.some(p => 
        (pattern.index >= p.index && pattern.index < p.end) ||
        (pattern.end > p.index && pattern.end <= p.end) ||
        (pattern.index <= p.index && pattern.end >= p.end)
      )
      if (!overlaps) {
        filteredPatterns.push(pattern)
      }
    }
  })
  
  // Re-sort by index
  filteredPatterns.sort((a, b) => a.index - b.index)
  
  // Build React nodes from patterns
  filteredPatterns.forEach((pattern, patternIdx) => {
    // Add text before pattern
    if (pattern.index > lastIndex) {
      const text = content.slice(lastIndex, pattern.index)
      if (text) {
        // Process text for inline formatting (bold, italic, etc.)
        // But skip if this text is part of a table (tables are handled as block patterns)
        const isInTable = blockLevelPatterns.some(p => 
          p.type === 'table' &&
          lastIndex >= p.index && 
          lastIndex < p.end
        )
        if (!isInTable) {
          parts.push(...parseInlineMarkdown(text, `text-${patternIdx}`, footnotes))
        }
      }
    }
    
    // Render pattern
    if (pattern.type === 'markdown-image') {
      const { url } = pattern.data
      const cleaned = cleanUrl(url)
      const imageIndex = imageIndexMap.get(cleaned)
      if (isImage(cleaned)) {
        parts.push(
          <div key={`img-${patternIdx}`} className="my-2 block">
            <Image
              image={{ url, pubkey: eventPubkey }}
              className="max-w-[400px] rounded-lg cursor-zoom-in"
              classNames={{
                wrapper: 'rounded-lg block',
                errorPlaceholder: 'aspect-square h-[30vh]'
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (imageIndex !== undefined) {
                  openLightbox(imageIndex)
                }
              }}
            />
          </div>
        )
      } else if (isVideo(cleaned) || isAudio(cleaned)) {
        parts.push(
          <div key={`media-${patternIdx}`} className="my-2">
            <MediaPlayer
              src={cleaned}
              className="max-w-[400px]"
              mustLoad={false}
            />
          </div>
        )
      }
    } else if (pattern.type === 'markdown-link') {
      const { text, url } = pattern.data
      const displayText = truncateLinkText(text)
      // Check if it's a relay URL - if so, link to relay page instead
      if (isWebsocketUrl(url)) {
        const relayPath = `/relays/${encodeURIComponent(url)}`
        parts.push(
          <a
            key={`relay-${patternIdx}`}
            href={relayPath}
            className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline break-words cursor-pointer"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              navigateToRelay(relayPath)
            }}
            title={text.length > 200 ? text : undefined}
          >
            {displayText}
          </a>
        )
      } else {
        // Render as green link (will show WebPreview at bottom for HTTP/HTTPS)
        parts.push(
          <a
            key={`link-${patternIdx}`}
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline break-words"
            onClick={(e) => e.stopPropagation()}
            title={text.length > 200 ? text : undefined}
          >
            {displayText}
          </a>
        )
      }
    } else if (pattern.type === 'relay-url') {
      const { url } = pattern.data
      const relayPath = `/relays/${encodeURIComponent(url)}`
      const displayText = truncateLinkText(url)
      parts.push(
        <a
          key={`relay-${patternIdx}`}
          href={relayPath}
          className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline break-words cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            navigateToRelay(relayPath)
          }}
          title={url.length > 200 ? url : undefined}
        >
          {displayText}
        </a>
      )
    } else if (pattern.type === 'header') {
      const { level, text } = pattern.data
      // Parse the header text for inline formatting (but not nested headers)
      const headerContent = parseInlineMarkdown(text, `header-${patternIdx}`, footnotes)
      const HeaderTag = `h${Math.min(level, 6)}` as keyof JSX.IntrinsicElements
      parts.push(
        <HeaderTag 
          key={`header-${patternIdx}`} 
          className={`font-bold break-words block mt-4 mb-2 ${
            level === 1 ? 'text-3xl' :
            level === 2 ? 'text-2xl' :
            level === 3 ? 'text-xl' :
            level === 4 ? 'text-lg' :
            level === 5 ? 'text-base' :
            'text-sm'
          }`}
        >
          {headerContent}
        </HeaderTag>
      )
    } else if (pattern.type === 'horizontal-rule') {
      parts.push(
        <hr key={`hr-${patternIdx}`} className="my-4 border-t border-gray-300 dark:border-gray-700" />
      )
    } else if (pattern.type === 'bullet-list-item') {
      const { text } = pattern.data
      const listContent = parseInlineMarkdown(text, `bullet-${patternIdx}`, footnotes)
      parts.push(
        <li key={`bullet-${patternIdx}`} className="list-disc list-inside my-1">
          {listContent}
        </li>
      )
    } else if (pattern.type === 'numbered-list-item') {
      const { text } = pattern.data
      const listContent = parseInlineMarkdown(text, `numbered-${patternIdx}`, footnotes)
      parts.push(
        <li key={`numbered-${patternIdx}`} className="list-decimal list-inside my-1">
          {listContent}
        </li>
      )
    } else if (pattern.type === 'table') {
      const { rows } = pattern.data
      if (rows.length > 0) {
        const headerRow = rows[0]
        const dataRows = rows.slice(1)
        parts.push(
          <div key={`table-${patternIdx}`} className="my-4 overflow-x-auto">
            <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-700">
              <thead>
                <tr>
                  {headerRow.map((cell: string, cellIdx: number) => (
                    <th 
                      key={`th-${patternIdx}-${cellIdx}`} 
                      className="border border-gray-300 dark:border-gray-700 px-4 py-2 bg-gray-100 dark:bg-gray-800 font-semibold text-left"
                    >
                      {parseInlineMarkdown(cell, `table-header-${patternIdx}-${cellIdx}`, footnotes)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((row: string[], rowIdx: number) => (
                  <tr key={`tr-${patternIdx}-${rowIdx}`}>
                    {row.map((cell: string, cellIdx: number) => (
                      <td 
                        key={`td-${patternIdx}-${rowIdx}-${cellIdx}`} 
                        className="border border-gray-300 dark:border-gray-700 px-4 py-2"
                      >
                        {parseInlineMarkdown(cell, `table-cell-${patternIdx}-${rowIdx}-${cellIdx}`, footnotes)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    } else if (pattern.type === 'footnote-definition') {
      // Don't render footnote definitions in the main content - they'll be rendered at the bottom
      // Just skip this pattern
    } else if (pattern.type === 'footnote-ref') {
      const footnoteId = pattern.data
      const footnoteText = footnotes.get(footnoteId)
      if (footnoteText) {
        parts.push(
          <sup key={`footnote-ref-${patternIdx}`} className="footnote-ref">
            <a 
              href={`#footnote-${footnoteId}`} 
              id={`footnote-ref-${footnoteId}`}
              className="text-blue-600 dark:text-blue-400 hover:underline no-underline"
              onClick={(e) => {
                e.preventDefault()
                const footnoteElement = document.getElementById(`footnote-${footnoteId}`)
                if (footnoteElement) {
                  footnoteElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }}
            >
              [{footnoteId}]
            </a>
          </sup>
        )
      } else {
        // Footnote not found, just render the reference as-is
        parts.push(<span key={`footnote-ref-${patternIdx}`}>[^{footnoteId}]</span>)
      }
    } else if (pattern.type === 'nostr') {
      const bech32Id = pattern.data
      // Check if it's a profile type (mentions/handles should be inline)
      if (bech32Id.startsWith('npub') || bech32Id.startsWith('nprofile')) {
        parts.push(
          <span key={`nostr-${patternIdx}`} className="inline-block">
            <EmbeddedMention userId={bech32Id} />
          </span>
        )
      } else if (bech32Id.startsWith('note') || bech32Id.startsWith('nevent') || bech32Id.startsWith('naddr')) {
        // Embedded events should be block-level and fill width
        parts.push(
          <div key={`nostr-${patternIdx}`} className="w-full my-2">
            <EmbeddedNote noteId={bech32Id} />
          </div>
        )
      } else {
        parts.push(<span key={`nostr-${patternIdx}`}>nostr:{bech32Id}</span>)
      }
    } else if (pattern.type === 'hashtag') {
      const tag = pattern.data
      const tagLower = tag.toLowerCase()
      hashtagsInContent.add(tagLower) // Track hashtags rendered inline
      parts.push(
        <a
          key={`hashtag-${patternIdx}`}
          href={`/notes?t=${tagLower}`}
          className="inline text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            navigateToHashtag(`/notes?t=${tagLower}`)
          }}
        >
          #{tag}
        </a>
      )
    } else if (pattern.type === 'wikilink') {
      const linkContent = pattern.data
      let target = linkContent.includes('|') ? linkContent.split('|')[0].trim() : linkContent.trim()
      let displayText = linkContent.includes('|') ? linkContent.split('|')[1].trim() : linkContent.trim()
      
      if (linkContent.startsWith('book:')) {
        target = linkContent.replace('book:', '').trim()
      }
      
      const dtag = target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      
      parts.push(
        <Wikilink key={`wikilink-${patternIdx}`} dTag={dtag} displayText={displayText} />
      )
    }
    
    lastIndex = pattern.end
  })
  
  // Add remaining text
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex)
    if (text) {
      // Process text for inline formatting
      // But skip if this text is part of a table
      const isInTable = blockLevelPatterns.some(p => 
        p.type === 'table' &&
        lastIndex >= p.index && 
        lastIndex < p.end
      )
      if (!isInTable) {
        parts.push(...parseInlineMarkdown(text, 'text-end', footnotes))
      }
    }
  }
  
  // If no patterns, just return the content as text (with inline formatting)
  if (parts.length === 0) {
    const formattedContent = parseInlineMarkdown(content, 'text-only', footnotes)
    return { nodes: formattedContent, hashtagsInContent, footnotes }
  }
  
  // Wrap list items in <ul> or <ol> tags
  const wrappedParts: React.ReactNode[] = []
  let partIdx = 0
  while (partIdx < parts.length) {
    const part = parts[partIdx]
    // Check if this is a list item
    if (React.isValidElement(part) && part.type === 'li') {
      // Determine if it's a bullet or numbered list
      const isBullet = part.key && part.key.toString().startsWith('bullet-')
      const isNumbered = part.key && part.key.toString().startsWith('numbered-')
      
      if (isBullet || isNumbered) {
        // Collect consecutive list items of the same type
        const listItems: React.ReactNode[] = [part]
        partIdx++
        while (partIdx < parts.length) {
          const nextPart = parts[partIdx]
          if (React.isValidElement(nextPart) && nextPart.type === 'li') {
            const nextIsBullet = nextPart.key && nextPart.key.toString().startsWith('bullet-')
            const nextIsNumbered = nextPart.key && nextPart.key.toString().startsWith('numbered-')
            if ((isBullet && nextIsBullet) || (isNumbered && nextIsNumbered)) {
              listItems.push(nextPart)
              partIdx++
            } else {
              break
            }
          } else {
            break
          }
        }
        
        // Wrap in <ul> or <ol>
        if (isBullet) {
          wrappedParts.push(
            <ul key={`ul-${partIdx}`} className="list-disc list-inside my-2 space-y-1">
              {listItems}
            </ul>
          )
        } else {
          wrappedParts.push(
            <ol key={`ol-${partIdx}`} className="list-decimal list-inside my-2 space-y-1">
              {listItems}
            </ol>
          )
        }
        continue
      }
    }
    
    wrappedParts.push(part)
    partIdx++
  }
  
  // Add footnotes section at the end if there are any footnotes
  if (footnotes.size > 0) {
    wrappedParts.push(
      <div key="footnotes-section" className="mt-8 pt-4 border-t border-gray-300 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-4">Footnotes</h3>
        <ol className="list-decimal list-inside space-y-2">
          {Array.from(footnotes.entries()).map(([id, text]) => (
            <li 
              key={`footnote-${id}`} 
              id={`footnote-${id}`}
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="font-semibold">[{id}]:</span>{' '}
              <span>{parseInlineMarkdown(text, `footnote-${id}`, footnotes)}</span>
              {' '}
              <a 
                href={`#footnote-ref-${id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                onClick={(e) => {
                  e.preventDefault()
                  const refElement = document.getElementById(`footnote-ref-${id}`)
                  if (refElement) {
                    refElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                }}
              >
                ↩
              </a>
            </li>
          ))}
        </ol>
      </div>
    )
  }
  
  return { nodes: wrappedParts, hashtagsInContent, footnotes }
}

/**
 * Parse inline markdown formatting (bold, italic, strikethrough, inline code, footnote references)
 * Returns an array of React nodes
 * 
 * Supports:
 * - Bold: **text** or __text__ (double) or *text* (single asterisk)
 * - Italic: _text_ (single underscore) or __text__ (double underscore, but bold takes priority)
 * - Strikethrough: ~~text~~ (double tilde) or ~text~ (single tilde)
 * - Inline code: ``code`` (double backtick) or `code` (single backtick)
 * - Footnote references: [^1] (handled at block level, but parsed here for inline context)
 */
function parseInlineMarkdown(text: string, keyPrefix: string, _footnotes: Map<string, string> = new Map()): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const inlinePatterns: Array<{ index: number; end: number; type: string; data: any }> = []
  
  // Inline code: ``code`` (double backtick) or `code` (single backtick) - process first to avoid conflicts
  // Double backticks first
  const doubleCodeRegex = /``([^`\n]+?)``/g
  const doubleCodeMatches = Array.from(text.matchAll(doubleCodeRegex))
  doubleCodeMatches.forEach(match => {
    if (match.index !== undefined) {
      inlinePatterns.push({
        index: match.index,
        end: match.index + match[0].length,
        type: 'code',
        data: match[1]
      })
    }
  })
  
  // Single backtick (but not if already in double backtick)
  const singleCodeRegex = /`([^`\n]+?)`/g
  const singleCodeMatches = Array.from(text.matchAll(singleCodeRegex))
  singleCodeMatches.forEach(match => {
    if (match.index !== undefined) {
      const isInDoubleCode = inlinePatterns.some(p => 
        p.type === 'code' &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInDoubleCode) {
        inlinePatterns.push({
              index: match.index,
              end: match.index + match[0].length,
          type: 'code',
          data: match[1]
        })
      }
    }
  })
  
  // Bold: **text** (double asterisk) or __text__ (double underscore) - process first
  // Also handle *text* (single asterisk) as bold
  const doubleBoldAsteriskRegex = /\*\*(.+?)\*\*/g
  const doubleBoldAsteriskMatches = Array.from(text.matchAll(doubleBoldAsteriskRegex))
  doubleBoldAsteriskMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code
      const isInCode = inlinePatterns.some(p => 
        p.type === 'code' &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInCode) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'bold',
          data: match[1]
        })
      }
    }
  })
  
  // Double underscore bold (but check if it's already italic)
  const doubleBoldUnderscoreRegex = /__(.+?)__/g
  const doubleBoldUnderscoreMatches = Array.from(text.matchAll(doubleBoldUnderscoreRegex))
  doubleBoldUnderscoreMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code or bold
      const isInOther = inlinePatterns.some(p => 
        (p.type === 'code' || p.type === 'bold') &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'bold',
          data: match[1]
        })
      }
    }
  })
  
  // Single asterisk bold: *text* (not part of **bold**)
  const singleBoldAsteriskRegex = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g
  const singleBoldAsteriskMatches = Array.from(text.matchAll(singleBoldAsteriskRegex))
  singleBoldAsteriskMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code, double bold, or strikethrough
      const isInOther = inlinePatterns.some(p => 
        (p.type === 'code' || p.type === 'bold' || p.type === 'strikethrough') &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'bold',
          data: match[1]
        })
      }
    }
  })
  
  // Strikethrough: ~~text~~ (double tilde) or ~text~ (single tilde)
  // Double tildes first
  const doubleStrikethroughRegex = /~~(.+?)~~/g
  const doubleStrikethroughMatches = Array.from(text.matchAll(doubleStrikethroughRegex))
  doubleStrikethroughMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code or bold
      const isInOther = inlinePatterns.some(p => 
        (p.type === 'code' || p.type === 'bold') &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'strikethrough',
          data: match[1]
        })
      }
    }
  })
  
  // Single tilde strikethrough
  const singleStrikethroughRegex = /(?<!~)~([^~\n]+?)~(?!~)/g
  const singleStrikethroughMatches = Array.from(text.matchAll(singleStrikethroughRegex))
  singleStrikethroughMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code, bold, or double strikethrough
      const isInOther = inlinePatterns.some(p => 
        (p.type === 'code' || p.type === 'bold' || p.type === 'strikethrough') &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'strikethrough',
          data: match[1]
        })
      }
    }
  })
  
  // Italic: _text_ (single underscore) or __text__ (double underscore, but bold takes priority)
  // Single underscore italic (not part of __bold__)
  const singleItalicUnderscoreRegex = /(?<!_)_([^_\n]+?)_(?!_)/g
  const singleItalicUnderscoreMatches = Array.from(text.matchAll(singleItalicUnderscoreRegex))
  singleItalicUnderscoreMatches.forEach(match => {
    if (match.index !== undefined) {
      // Skip if already in code, bold, or strikethrough
      const isInOther = inlinePatterns.some(p => 
        (p.type === 'code' || p.type === 'bold' || p.type === 'strikethrough') &&
        match.index! >= p.index && 
        match.index! < p.end
      )
      if (!isInOther) {
        inlinePatterns.push({
          index: match.index,
          end: match.index + match[0].length,
          type: 'italic',
          data: match[1]
        })
      }
    }
  })
  
  // Double underscore italic (only if not already bold)
  // Note: __text__ is bold by default, but if user wants it italic, we can add it
  // For now, we'll keep __text__ as bold only, and _text_ as italic
  
  // Sort by index
  inlinePatterns.sort((a, b) => a.index - b.index)
  
  // Remove overlaps (keep first)
  const filtered: typeof inlinePatterns = []
  let lastEnd = 0
  inlinePatterns.forEach(pattern => {
    if (pattern.index >= lastEnd) {
      filtered.push(pattern)
      lastEnd = pattern.end
    }
  })
  
  // Build nodes
  filtered.forEach((pattern, i) => {
    // Add text before pattern
    if (pattern.index > lastIndex) {
      const textBefore = text.slice(lastIndex, pattern.index)
      if (textBefore) {
        parts.push(<span key={`${keyPrefix}-inline-text-${i}`}>{textBefore}</span>)
      }
    }
    
    // Render pattern
    if (pattern.type === 'bold') {
      parts.push(<strong key={`${keyPrefix}-bold-${i}`}>{pattern.data}</strong>)
    } else if (pattern.type === 'italic') {
      parts.push(<em key={`${keyPrefix}-italic-${i}`}>{pattern.data}</em>)
    } else if (pattern.type === 'strikethrough') {
      parts.push(<del key={`${keyPrefix}-strikethrough-${i}`} className="line-through">{pattern.data}</del>)
    } else if (pattern.type === 'code') {
      parts.push(
        <code key={`${keyPrefix}-code-${i}`} className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
          {pattern.data}
        </code>
      )
    }
    
    lastIndex = pattern.end
  })
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex)
    if (remaining) {
      parts.push(<span key={`${keyPrefix}-inline-text-final`}>{remaining}</span>)
    }
  }
  
  // If no patterns found, return the text as-is
  if (parts.length === 0) {
    return [<span key={`${keyPrefix}-plain`}>{text}</span>]
  }
  
  return parts
}

export default function MarkdownArticle({
  event,
  className,
  hideMetadata = false
}: {
  event: Event
  className?: string
  hideMetadata?: boolean
}) {
  const { push } = useSecondaryPage()
  const { navigateToHashtag } = useSmartHashtagNavigation()
  const { navigateToRelay } = useSmartRelayNavigation()
  const metadata = useMemo(() => getLongFormArticleMetadataFromEvent(event), [event])
  
  // Extract all media from event
  const extractedMedia = useMediaExtraction(event, event.content)
  
  // Extract media from tags only (for display at top)
  const tagMedia = useMemo(() => {
    const seenUrls = new Set<string>()
    const media: Array<{ url: string; type: 'image' | 'video' | 'audio' }> = []
    
    // Extract from imeta tags
    const imetaInfos = getImetaInfosFromEvent(event)
    imetaInfos.forEach((info) => {
      const cleaned = cleanUrl(info.url)
      if (!cleaned || seenUrls.has(cleaned)) return
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      if (info.m?.startsWith('image/') || isImage(cleaned)) {
        media.push({ url: info.url, type: 'image' })
      } else if (info.m?.startsWith('video/') || isVideo(cleaned)) {
        media.push({ url: info.url, type: 'video' })
      } else if (info.m?.startsWith('audio/') || isAudio(cleaned)) {
        media.push({ url: info.url, type: 'audio' })
      }
    })
    
    // Extract from r tags
    event.tags.filter(tag => tag[0] === 'r' && tag[1]).forEach(tag => {
      const url = tag[1]
      const cleaned = cleanUrl(url)
      if (!cleaned || seenUrls.has(cleaned)) return
      if (!isImage(cleaned) && !isMedia(cleaned)) return
      
      seenUrls.add(cleaned)
      if (isImage(cleaned)) {
        media.push({ url, type: 'image' })
      } else if (isVideo(cleaned)) {
        media.push({ url, type: 'video' })
      } else if (isAudio(cleaned)) {
        media.push({ url, type: 'audio' })
      }
    })
    
    // Extract from image tag
    const imageTag = event.tags.find(tag => tag[0] === 'image' && tag[1])
    if (imageTag?.[1]) {
      const cleaned = cleanUrl(imageTag[1])
      if (cleaned && !seenUrls.has(cleaned) && isImage(cleaned)) {
        seenUrls.add(cleaned)
        media.push({ url: imageTag[1], type: 'image' })
      }
    }
    
    return media
  }, [event.id, JSON.stringify(event.tags)])
  
  // Extract non-media links from tags
  const tagLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    
    event.tags
      .filter(tag => tag[0] === 'r' && tag[1])
      .forEach(tag => {
        const url = tag[1]
        if (!url.startsWith('http://') && !url.startsWith('https://')) return
        if (isImage(url) || isMedia(url)) return
        
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      })
    
    return links
  }, [event.id, JSON.stringify(event.tags)])
  
  // Get all images for gallery (deduplicated)
  const allImages = useMemo(() => {
    const seenUrls = new Set<string>()
    const images: Array<{ url: string; alt?: string }> = []
    
    // Add images from extractedMedia
    extractedMedia.images.forEach(img => {
      const cleaned = cleanUrl(img.url)
      if (cleaned && !seenUrls.has(cleaned)) {
        seenUrls.add(cleaned)
        images.push({ url: img.url, alt: img.alt })
      }
    })
    
    // Add metadata image if it exists
    if (metadata.image) {
      const cleaned = cleanUrl(metadata.image)
      if (cleaned && !seenUrls.has(cleaned) && isImage(cleaned)) {
        seenUrls.add(cleaned)
        images.push({ url: metadata.image })
      }
    }
    
    return images
  }, [extractedMedia.images, metadata.image])
  
  // Create image index map for lightbox
  const imageIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    allImages.forEach((img, index) => {
      const cleaned = cleanUrl(img.url)
      if (cleaned) map.set(cleaned, index)
    })
    return map
  }, [allImages])
  
  // Parse content to find media URLs that are already rendered
  const mediaUrlsInContent = useMemo(() => {
    const urls = new Set<string>()
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    let match
    while ((match = urlRegex.exec(event.content)) !== null) {
      const url = match[0]
      const cleaned = cleanUrl(url)
      if (cleaned && (isImage(cleaned) || isVideo(cleaned) || isAudio(cleaned))) {
        urls.add(cleaned)
      }
    }
    return urls
  }, [event.content])
  
  // Extract non-media links from content
  const contentLinks = useMemo(() => {
    const links: string[] = []
    const seenUrls = new Set<string>()
    const urlRegex = /https?:\/\/[^\s<>"']+/g
    let match
    while ((match = urlRegex.exec(event.content)) !== null) {
      const url = match[0]
      if ((url.startsWith('http://') || url.startsWith('https://')) && !isImage(url) && !isMedia(url)) {
        const cleaned = cleanUrl(url)
        if (cleaned && !seenUrls.has(cleaned)) {
          links.push(cleaned)
          seenUrls.add(cleaned)
        }
      }
    }
    return links
  }, [event.content])
  
  // Image gallery state
  const [lightboxIndex, setLightboxIndex] = useState(-1)
  
  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
  }, [])
  
  // Filter tag media to only show what's not in content
  const leftoverTagMedia = useMemo(() => {
    const metadataImageUrl = metadata.image ? cleanUrl(metadata.image) : null
    return tagMedia.filter(media => {
      const cleaned = cleanUrl(media.url)
      if (!cleaned) return false
      // Skip if already in content
      if (mediaUrlsInContent.has(cleaned)) return false
      // Skip if this is the metadata image (shown separately)
      if (metadataImageUrl && cleaned === metadataImageUrl && !hideMetadata) return false
      return true
    })
  }, [tagMedia, mediaUrlsInContent, metadata.image, hideMetadata])
  
  // Filter tag links to only show what's not in content (to avoid duplicate WebPreview cards)
  const leftoverTagLinks = useMemo(() => {
    const contentLinksSet = new Set(contentLinks.map(link => cleanUrl(link)).filter(Boolean))
    return tagLinks.filter(link => {
      const cleaned = cleanUrl(link)
      return cleaned && !contentLinksSet.has(cleaned)
    })
  }, [tagLinks, contentLinks])
  
  // Preprocess content to convert URLs to markdown syntax
  const preprocessedContent = useMemo(() => {
    return preprocessMarkdownMediaLinks(event.content)
  }, [event.content])
  
  // Parse markdown content with post-processing for nostr: links and hashtags
  const { nodes: parsedContent, hashtagsInContent } = useMemo(() => {
    const result = parseMarkdownContent(preprocessedContent, {
      eventPubkey: event.pubkey,
      imageIndexMap,
      openLightbox,
      navigateToHashtag,
      navigateToRelay
    })
    // Return nodes and hashtags (footnotes are already included in nodes)
    return { nodes: result.nodes, hashtagsInContent: result.hashtagsInContent }
  }, [preprocessedContent, event.pubkey, imageIndexMap, openLightbox, navigateToHashtag, navigateToRelay])
  
  // Filter metadata tags to only show what's not already in content
  const leftoverMetadataTags = useMemo(() => {
    return metadata.tags.filter(tag => !hashtagsInContent.has(tag.toLowerCase()))
  }, [metadata.tags, hashtagsInContent])
  
  return (
    <>
      <div className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}>
        {/* Metadata */}
                {!hideMetadata && metadata.title && <h1 className="break-words">{metadata.title}</h1>}
                {!hideMetadata && metadata.summary && (
                  <blockquote>
                    <p className="break-words">{metadata.summary}</p>
                  </blockquote>
                )}
                {hideMetadata && metadata.title && event.kind !== ExtendedKind.DISCUSSION && (
                  <h2 className="text-2xl font-bold mb-4 leading-tight break-words">{metadata.title}</h2>
                )}
        
        {/* Metadata image */}
                {!hideMetadata && metadata.image && (() => {
        const cleanedMetadataImage = cleanUrl(metadata.image)
          // Don't show if already in content
          if (cleanedMetadataImage && mediaUrlsInContent.has(cleanedMetadataImage)) {
            return null
          }
          
          const metadataImageIndex = imageIndexMap.get(cleanedMetadataImage)
        
        return (
          <Image
            image={{ url: metadata.image, pubkey: event.pubkey }}
            className="max-w-[400px] w-full h-auto my-0 cursor-zoom-in"
            classNames={{
              wrapper: 'rounded-lg',
              errorPlaceholder: 'aspect-square h-[30vh]'
            }}
            onClick={(e) => {
              e.stopPropagation()
                if (metadataImageIndex !== undefined) {
                  openLightbox(metadataImageIndex)
              }
            }}
          />
        )
      })()}
        
        {/* Media from tags (only if not in content) */}
        {leftoverTagMedia.length > 0 && (
          <div className="space-y-4 mb-6">
            {leftoverTagMedia.map((media) => {
              const cleaned = cleanUrl(media.url)
              const mediaIndex = imageIndexMap.get(cleaned)
              
              if (media.type === 'image') {
                return (
                  <div key={`tag-media-${cleaned}`} className="my-2">
                    <Image
                      image={{ url: media.url, pubkey: event.pubkey }}
                      className="max-w-[400px] rounded-lg cursor-zoom-in"
                      classNames={{
                        wrapper: 'rounded-lg',
                        errorPlaceholder: 'aspect-square h-[30vh]'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (mediaIndex !== undefined) {
                          openLightbox(mediaIndex)
                        }
                      }}
                    />
        </div>
                )
              } else if (media.type === 'video' || media.type === 'audio') {
                return (
                  <div key={`tag-media-${cleaned}`} className="my-2">
                    <MediaPlayer
                      src={media.url}
                      className="max-w-[400px]"
                      mustLoad={true}
                    />
                  </div>
                )
              }
              return null
            })}
        </div>
      )}
      
        {/* Parsed content */}
        <div className="break-words whitespace-pre-wrap">
          {parsedContent}
        </div>
        
        {/* Hashtags from metadata (only if not already in content) */}
        {leftoverMetadataTags.length > 0 && (
        <div className="flex gap-2 flex-wrap pb-2 mt-4">
            {leftoverMetadataTags.map((tag) => (
              <div
                key={tag}
                title={tag}
                className="flex items-center rounded-full px-3 bg-muted text-muted-foreground max-w-44 cursor-pointer hover:bg-accent hover:text-accent-foreground"
                onClick={(e) => {
                  e.stopPropagation()
                  push(toNoteList({ hashtag: tag, kinds: [kinds.LongFormArticle] }))
                }}
              >
                #<span className="truncate">{tag}</span>
              </div>
            ))}
        </div>
      )}

        {/* WebPreview cards for links from tags (only if not already in content) */}
        {/* Note: Links in content are already rendered as green hyperlinks above, so we don't show WebPreview for them */}
        {leftoverTagLinks.length > 0 && (
          <div className="space-y-3 mt-6">
            {leftoverTagLinks.map((url, index) => (
            <WebPreview key={`tag-${index}-${url}`} url={url} className="w-full" />
          ))}
        </div>
      )}
      </div>
      
      {/* Image gallery lightbox */}
      {allImages.length > 0 && lightboxIndex >= 0 && createPortal(
        <div onClick={(e) => e.stopPropagation()}>
          <Lightbox
            index={lightboxIndex}
            slides={allImages.map(({ url, alt }) => ({ 
              src: url, 
              alt: alt || url 
            }))}
            plugins={[Zoom]}
            open={lightboxIndex >= 0}
            close={() => setLightboxIndex(-1)}
            controller={{
              closeOnBackdropClick: true,
              closeOnPullUp: true,
              closeOnPullDown: true
            }}
            styles={{
              toolbar: { paddingTop: '2.25rem' }
            }}
            carousel={{
              finite: false
            }}
          />
        </div>,
        document.body
      )}
    </>
  )
}
