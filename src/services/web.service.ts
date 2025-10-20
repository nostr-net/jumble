import { TWebMetadata } from '@/types'
import DataLoader from 'dataloader'

class WebService {
  static instance: WebService

  private webMetadataDataLoader = new DataLoader<string, TWebMetadata>(
    async (urls) => {
      return await Promise.all(
        urls.map(async (url) => {
          try {
            // Add timeout and better error handling for CORS issues
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
            
            const res = await fetch(url, {
              signal: controller.signal,
              mode: 'cors',
              credentials: 'omit'
            })
            
            clearTimeout(timeoutId)
            
            if (!res.ok) {
              // Don't log 404s and CORS errors as they're expected
              if (res.status !== 404 && res.status !== 0) {
                console.warn(`Failed to fetch metadata for ${url}: ${res.status} ${res.statusText}`)
              }
              return {}
            }
            
            const html = await res.text()
            const parser = new DOMParser()
            const doc = parser.parseFromString(html, 'text/html')

            const title =
              doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
              doc.querySelector('title')?.textContent
            const description =
              doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
              (doc.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content
            const image = (doc.querySelector('meta[property="og:image"]') as HTMLMetaElement | null)
              ?.content

            return { title, description, image }
          } catch (error) {
            // Only log unexpected errors, not CORS or network issues
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
              // This is likely a CORS error - don't log it
              return {}
            }
            if (error instanceof Error && error.name === 'AbortError') {
              // Timeout - don't log it
              return {}
            }
            // Log other unexpected errors
            console.warn(`Unexpected error fetching metadata for ${url}:`, error)
            return {}
          }
        })
      )
    },
    { maxBatchSize: 1 }
  )

  constructor() {
    if (!WebService.instance) {
      WebService.instance = this
    }
    return WebService.instance
  }

  async fetchWebMetadata(url: string) {
    return await this.webMetadataDataLoader.load(url)
  }
}

const instance = new WebService()

export default instance
