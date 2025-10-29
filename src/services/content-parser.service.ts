/**
 * Comprehensive content parsing service for all Nostr content fields
 * Supports AsciiDoc, Advanced Markdown, Basic Markdown, and LaTeX
 */

import { detectMarkupType, getMarkupClasses, MarkupType } from '@/lib/markup-detection'
import { Event } from 'nostr-tools'
import { getImetaInfosFromEvent } from '@/lib/event'
import { URL_REGEX } from '@/constants'
import { TImetaInfo } from '@/types'

export interface ParsedContent {
  html: string
  markupType: MarkupType
  cssClasses: string
  hasMath: boolean
  media: TImetaInfo[]
  links: Array<{ url: string; text: string; isExternal: boolean }>
  hashtags: string[]
  nostrLinks: Array<{ type: 'npub' | 'nprofile' | 'nevent' | 'naddr' | 'note'; id: string; text: string }>
}

export interface ParseOptions {
  eventKind?: number
  field?: 'content' | 'title' | 'summary' | 'description'
  maxWidth?: string
  enableMath?: boolean
  enableSyntaxHighlighting?: boolean
}

class ContentParserService {
  private asciidoctor: any = null
  private isAsciidoctorLoaded = false

  /**
   * Initialize AsciiDoctor (lazy loading)
   */
  private async loadAsciidoctor() {
    if (this.isAsciidoctorLoaded) return this.asciidoctor

    try {
      const Asciidoctor = await import('@asciidoctor/core')
      this.asciidoctor = Asciidoctor.default()
      this.isAsciidoctorLoaded = true
      return this.asciidoctor
    } catch (error) {
      console.warn('Failed to load AsciiDoctor:', error)
      return null
    }
  }

  /**
   * Parse content with appropriate markup processor
   */
  async parseContent(
    content: string, 
    options: ParseOptions = {},
    event?: Event
  ): Promise<ParsedContent> {
    const {
      eventKind,
      enableMath = true,
      enableSyntaxHighlighting = true
    } = options

    // Detect markup type
    const markupType = detectMarkupType(content, eventKind)
    const cssClasses = getMarkupClasses(markupType)

    // Extract all content elements
    const media = this.extractAllMedia(content, event)
    const links = this.extractLinks(content)
    const hashtags = this.extractHashtags(content)
    const nostrLinks = this.extractNostrLinks(content)

    // Check for LaTeX math
    const hasMath = enableMath && this.hasMathContent(content)

    let html = ''
    let processedContent = content

    try {
      switch (markupType) {
        case 'asciidoc':
          html = await this.parseAsciidoc(content, { enableMath, enableSyntaxHighlighting })
          break

        case 'advanced-markdown':
          processedContent = this.preprocessAdvancedMarkdown(content)
          html = await this.parseAdvancedMarkdown(processedContent, { enableMath, enableSyntaxHighlighting })
          break

        case 'basic-markdown':
          processedContent = this.preprocessBasicMarkdown(content)
          html = await this.parseBasicMarkdown(processedContent)
          break

        case 'plain-text':
        default:
          html = this.parsePlainText(content)
          break
      }
    } catch (error) {
      console.error('Content parsing error:', error)
      // Fallback to plain text
      html = this.parsePlainText(content)
    }

    return {
      html,
      markupType,
      cssClasses,
      hasMath,
      media,
      links,
      hashtags,
      nostrLinks
    }
  }

  /**
   * Parse AsciiDoc content
   */
  private async parseAsciidoc(content: string, options: { enableMath: boolean; enableSyntaxHighlighting: boolean }): Promise<string> {
    const asciidoctor = await this.loadAsciidoctor()
    if (!asciidoctor) {
      return this.parsePlainText(content)
    }

    try {
      const result = asciidoctor.convert(content, {
        safe: 'safe',
        backend: 'html5',
        doctype: 'article',
        attributes: {
          'showtitle': true,
          'sectanchors': true,
          'sectlinks': true,
          'source-highlighter': options.enableSyntaxHighlighting ? 'highlight.js' : 'none',
          'stem': options.enableMath ? 'latexmath' : 'none'
        }
      })

      const htmlString = typeof result === 'string' ? result : result.toString()
      
      // Clean up any leftover markdown syntax
      return this.cleanupMarkdown(htmlString)
    } catch (error) {
      console.error('AsciiDoc parsing error:', error)
      return this.parsePlainText(content)
    }
  }

  /**
   * Parse advanced Markdown content
   */
  private async parseAdvancedMarkdown(content: string, _options: { enableMath: boolean; enableSyntaxHighlighting: boolean }): Promise<string> {
    // This will be handled by react-markdown with plugins
    // Return the processed content for react-markdown to handle
    return content
  }

  /**
   * Parse basic Markdown content
   */
  private parseBasicMarkdown(content: string): string {
    // Basic markdown processing
    let processed = content

    // Headers
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>')
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>')
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>')

    // Bold and italic
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>')
    processed = processed.replace(/_(.*?)_/g, '<em>$1</em>')
    processed = processed.replace(/~(.*?)~/g, '<del>$1</del>')

    // Links and images
    processed = this.processLinks(processed)
    processed = this.processImages(processed)

    // Lists
    processed = this.processLists(processed)

    // Blockquotes
    processed = processed.replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')

    // Line breaks
    processed = processed.replace(/\n\n/g, '</p><p>')
    processed = `<p>${processed}</p>`

    return processed
  }

  /**
   * Parse plain text content
   */
  private parsePlainText(content: string): string {
    // Convert line breaks to HTML
    return content
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>')
  }

  /**
   * Preprocess advanced Markdown content
   */
  private preprocessAdvancedMarkdown(content: string): string {
    // Handle wikilinks: [[NIP-54]] -> [NIP-54](https://next-alexandria.gitcitadel.eu/publication?d=nip-54)
    content = content.replace(/\[\[([^\]]+)\]\]/g, (_match, text) => {
      const slug = text.toLowerCase().replace(/\s+/g, '-')
      return `[${text}](https://next-alexandria.gitcitadel.eu/publication?d=${slug})`
    })

    // Handle hashtags: #hashtag -> [#hashtag](/hashtag/hashtag)
    content = content.replace(/#([a-zA-Z0-9_]+)/g, (_match, tag) => {
      return `[#${tag}](/hashtag/${tag})`
    })

    return content
  }

  /**
   * Preprocess basic Markdown content
   */
  private preprocessBasicMarkdown(content: string): string {
    // Handle hashtags
    content = content.replace(/#([a-zA-Z0-9_]+)/g, (_match, tag) => {
      return `[#${tag}](/hashtag/${tag})`
    })

    // Handle emoji shortcodes
    content = content.replace(/:([a-zA-Z0-9_]+):/g, (_match, _emoji) => {
      // This would need an emoji mapping - for now just return as-is
      return _match
    })

    return content
  }

  /**
   * Process markdown links
   */
  private processLinks(content: string): string {
    return content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      // Check if it's already an HTML link
      if (content.includes(`href="${url}"`)) {
        return match
      }
      
      // Handle nostr: prefixes
      if (url.startsWith('nostr:')) {
        return `<span class="nostr-link" data-nostr="${url}">${text}</span>`
      }
      
      return `<a href="${url}" target="_blank" rel="noreferrer noopener" class="break-words inline-flex items-baseline gap-1">${text} <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>`
    })
  }

  /**
   * Process markdown images
   */
  private processImages(content: string): string {
    return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      const altText = alt || ''
      return `<img src="${url}" alt="${altText}" class="max-w-[400px] object-contain my-0" />`
    })
  }

  /**
   * Process markdown lists
   */
  private processLists(content: string): string {
    // Unordered lists
    content = content.replace(/^[\s]*\* (.+)$/gm, '<li>$1</li>')
    content = content.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

    // Ordered lists
    content = content.replace(/^[\s]*\d+\. (.+)$/gm, '<li>$1</li>')
    content = content.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>')

    return content
  }

  /**
   * Clean up leftover markdown syntax after AsciiDoc processing
   */
  private cleanupMarkdown(html: string): string {
    let cleaned = html

    // Clean up markdown image syntax: ![alt](url)
    cleaned = cleaned.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
      const altText = alt || ''
      return `<img src="${url}" alt="${altText}" class="max-w-[400px] object-contain my-0" />`
    })

    // Clean up markdown link syntax: [text](url)
    cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
      // Check if it's already an HTML link
      if (cleaned.includes(`href="${url}"`)) {
        return _match
      }
      return `<a href="${url}" target="_blank" rel="noreferrer noopener" class="break-words inline-flex items-baseline gap-1">${text} <svg class="size-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg></a>`
    })

    // Clean up markdown table syntax
    cleaned = this.cleanupMarkdownTables(cleaned)

    return cleaned
  }

  /**
   * Clean up markdown tables
   */
  private cleanupMarkdownTables(html: string): string {
    const tableRegex = /(\|.*\|[\r\n]+\|[\s\-\|]*[\r\n]+(\|.*\|[\r\n]+)*)/g

    return html.replace(tableRegex, (match) => {
      const lines = match.trim().split('\n').filter(line => line.trim())
      if (lines.length < 2) return match

      const headerRow = lines[0]
      const separatorRow = lines[1]
      const dataRows = lines.slice(2)

      // Check if it's actually a table (has separator row with dashes)
      if (!separatorRow.includes('-')) return match

      const headers = headerRow.split('|').map(cell => cell.trim()).filter(cell => cell)
      const rows = dataRows.map(row => 
        row.split('|').map(cell => cell.trim()).filter(cell => cell)
      )

      let tableHtml = '<table class="min-w-full border-collapse border border-gray-300 my-4">\n'
      
      // Header
      tableHtml += '  <thead>\n    <tr>\n'
      headers.forEach(header => {
        tableHtml += `      <th class="border border-gray-300 px-4 py-2 bg-gray-50 font-semibold text-left">${header}</th>\n`
      })
      tableHtml += '    </tr>\n  </thead>\n'
      
      // Body
      tableHtml += '  <tbody>\n'
      rows.forEach(row => {
        tableHtml += '    <tr>\n'
        row.forEach((cell, index) => {
          const tag = index < headers.length ? 'td' : 'td'
          tableHtml += `      <${tag} class="border border-gray-300 px-4 py-2">${cell}</${tag}>\n`
        })
        tableHtml += '    </tr>\n'
      })
      tableHtml += '  </tbody>\n'
      tableHtml += '</table>'

      return tableHtml
    })
  }

  /**
   * Extract all media from content and event
   */
  private extractAllMedia(content: string, event?: Event): TImetaInfo[] {
    const media: TImetaInfo[] = []
    const seenUrls = new Set<string>()

    // 1. Extract from imeta tags if event is provided
    if (event) {
      const imetaMedia = getImetaInfosFromEvent(event)
      imetaMedia.forEach(item => {
        if (!seenUrls.has(item.url)) {
          media.push(item)
          seenUrls.add(item.url)
        }
      })
    }

    // 2. Extract from markdown images: ![alt](url)
    const imageMatches = content.match(/!\[[^\]]*\]\(([^)]+)\)/g) || []
    imageMatches.forEach(match => {
      const url = match.match(/!\[[^\]]*\]\(([^)]+)\)/)?.[1]
      if (url && !seenUrls.has(url)) {
        const isVideo = /\.(mp4|webm|ogg)$/i.test(url)
        media.push({ 
          url, 
          pubkey: event?.pubkey || '', 
          m: isVideo ? 'video/*' : 'image/*' 
        })
        seenUrls.add(url)
      }
    })

    // 3. Extract from asciidoc images: image::url[alt,width]
    const asciidocImageMatches = content.match(/image::([^\[]+)\[/g) || []
    asciidocImageMatches.forEach(match => {
      const url = match.match(/image::([^\[]+)\[/)?.[1]
      if (url && !seenUrls.has(url)) {
        const isVideo = /\.(mp4|webm|ogg)$/i.test(url)
        media.push({ 
          url, 
          pubkey: event?.pubkey || '', 
          m: isVideo ? 'video/*' : 'image/*' 
        })
        seenUrls.add(url)
      }
    })

    // 4. Extract raw URLs from content
    const rawUrls = content.match(URL_REGEX) || []
    rawUrls.forEach(url => {
      if (!seenUrls.has(url)) {
        const isImage = /\.(jpeg|jpg|png|gif|webp|svg)$/i.test(url)
        const isVideo = /\.(mp4|webm|ogg)$/i.test(url)
        if (isImage || isVideo) {
          media.push({ 
            url, 
            pubkey: event?.pubkey || '', 
            m: isVideo ? 'video/*' : 'image/*' 
          })
          seenUrls.add(url)
        }
      }
    })

    return media
  }

  /**
   * Extract all links from content
   */
  private extractLinks(content: string): Array<{ url: string; text: string; isExternal: boolean }> {
    const links: Array<{ url: string; text: string; isExternal: boolean }> = []
    const seenUrls = new Set<string>()

    // Extract markdown links: [text](url)
    const markdownLinks = content.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []
    markdownLinks.forEach(_match => {
      const linkMatch = _match.match(/\[([^\]]+)\]\(([^)]+)\)/)
      if (linkMatch) {
        const [, text, url] = linkMatch
        if (!seenUrls.has(url)) {
          links.push({
            url,
            text,
            isExternal: this.isExternalUrl(url)
          })
          seenUrls.add(url)
        }
      }
    })

    // Extract asciidoc links: link:url[text]
    const asciidocLinks = content.match(/link:([^\[]+)\[([^\]]+)\]/g) || []
    asciidocLinks.forEach(_match => {
      const linkMatch = _match.match(/link:([^\[]+)\[([^\]]+)\]/)
      if (linkMatch) {
        const [, url, text] = linkMatch
        if (!seenUrls.has(url)) {
          links.push({
            url,
            text,
            isExternal: this.isExternalUrl(url)
          })
          seenUrls.add(url)
        }
      }
    })

    // Extract raw URLs
    const rawUrls = content.match(URL_REGEX) || []
    rawUrls.forEach(url => {
      if (!seenUrls.has(url) && !this.isNostrUrl(url)) {
        links.push({
          url,
          text: url,
          isExternal: this.isExternalUrl(url)
        })
        seenUrls.add(url)
      }
    })

    return links
  }

  /**
   * Extract hashtags from content
   */
  private extractHashtags(content: string): string[] {
    const hashtags: string[] = []
    const seenTags = new Set<string>()

    // Extract hashtags: #hashtag
    const hashtagMatches = content.match(/#([a-zA-Z0-9_]+)/g) || []
    hashtagMatches.forEach(_match => {
      const tag = _match.substring(1) // Remove #
      if (!seenTags.has(tag)) {
        hashtags.push(tag)
        seenTags.add(tag)
      }
    })

    return hashtags
  }

  /**
   * Extract Nostr links from content
   */
  private extractNostrLinks(content: string): Array<{ type: 'npub' | 'nprofile' | 'nevent' | 'naddr' | 'note'; id: string; text: string }> {
    const nostrLinks: Array<{ type: 'npub' | 'nprofile' | 'nevent' | 'naddr' | 'note'; id: string; text: string }> = []

    // Extract nostr: prefixed links
    const nostrMatches = content.match(/nostr:([a-z0-9]+[a-z0-9]{6,})/g) || []
    nostrMatches.forEach(_match => {
      const id = _match.substring(6) // Remove 'nostr:'
      const type = this.getNostrType(id)
      if (type) {
        nostrLinks.push({
          type,
          id,
          text: _match
        })
      }
    })

    // Extract raw nostr identifiers
    const rawNostrMatches = content.match(/([a-z0-9]+[a-z0-9]{6,})/g) || []
    rawNostrMatches.forEach(_match => {
      const type = this.getNostrType(_match)
      if (type && !nostrLinks.some(link => link.id === _match)) {
        nostrLinks.push({
          type,
          id: _match,
          text: _match
        })
      }
    })

    return nostrLinks
  }

  /**
   * Check if URL is external
   */
  private isExternalUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname !== window.location.hostname
    } catch {
      return true
    }
  }

  /**
   * Check if URL is a Nostr URL
   */
  private isNostrUrl(url: string): boolean {
    return url.startsWith('nostr:') || this.getNostrType(url) !== null
  }

  /**
   * Get Nostr identifier type
   */
  private getNostrType(id: string): 'npub' | 'nprofile' | 'nevent' | 'naddr' | 'note' | null {
    if (id.startsWith('npub')) return 'npub'
    if (id.startsWith('nprofile')) return 'nprofile'
    if (id.startsWith('nevent')) return 'nevent'
    if (id.startsWith('naddr')) return 'naddr'
    if (id.startsWith('note')) return 'note'
    return null
  }

  /**
   * Check if content has LaTeX math
   */
  private hasMathContent(content: string): boolean {
    // Check for inline math: $...$ or \(...\)
    const inlineMath = /\$[^$]+\$|\\\([^)]+\\\)/.test(content)
    
    // Check for block math: $$...$$ or \[...\]
    const blockMath = /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]/.test(content)
    
    return inlineMath || blockMath
  }

  /**
   * Parse content for a specific Nostr event field
   */
  async parseEventField(
    event: Event, 
    field: 'content' | 'title' | 'summary' | 'description',
    options: Omit<ParseOptions, 'eventKind' | 'field'> = {}
  ): Promise<ParsedContent> {
    const content = this.getFieldContent(event, field)
    if (!content) {
      return {
        html: '',
        markupType: 'plain-text',
        cssClasses: getMarkupClasses('plain-text'),
        hasMath: false,
        media: [],
        links: [],
        hashtags: [],
        nostrLinks: []
      }
    }

    return this.parseContent(content, {
      ...options,
      eventKind: event.kind,
      field
    }, event)
  }

  /**
   * Get content from specific event field
   */
  private getFieldContent(event: Event, field: 'content' | 'title' | 'summary' | 'description'): string {
    switch (field) {
      case 'content':
        return event.content
      case 'title':
        return event.tags.find(tag => tag[0] === 'title')?.[1] || ''
      case 'summary':
        return event.tags.find(tag => tag[0] === 'summary')?.[1] || ''
      case 'description':
        return event.tags.find(tag => tag[0] === 'd')?.[1] || ''
      default:
        return ''
    }
  }
}

// Export singleton instance
export const contentParserService = new ContentParserService()
export default contentParserService
