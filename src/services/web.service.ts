import { TWebMetadata } from '@/types'
import DataLoader from 'dataloader'

class WebService {
  static instance: WebService

  private webMetadataDataLoader = new DataLoader<string, TWebMetadata>(
    async (urls) => {
      return await Promise.all(
        urls.map(async (url) => {
          // Check if we should use proxy server to avoid CORS issues
          const proxyServer = import.meta.env.VITE_PROXY_SERVER
          const isProxyUrl = url.includes('/sites/')
          
          // If proxy is configured and URL isn't already proxied, use proxy
          let fetchUrl = url
          if (proxyServer && !isProxyUrl) {
            fetchUrl = `${proxyServer}/sites/${encodeURIComponent(url)}`
          }
          
          try {
            
            // Add timeout and better error handling
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout for proxy
            
            // Fetch with appropriate headers
            const res = await fetch(fetchUrl, {
              signal: controller.signal,
              mode: 'cors',
              credentials: 'omit',
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              }
            })
            
            clearTimeout(timeoutId)
            
            if (!res.ok) {
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
            // Silent fail - return empty metadata on any error
            return {}
          }
        })
      )
    },
    { maxBatchSize: 1, batchScheduleFn: (callback) => setTimeout(callback, 100) }
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
