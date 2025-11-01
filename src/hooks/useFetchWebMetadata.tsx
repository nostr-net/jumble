import { TWebMetadata } from '@/types'
import { useEffect, useState } from 'react'
import webService from '@/services/web.service'

export function useFetchWebMetadata(url: string) {
  const [metadata, setMetadata] = useState<TWebMetadata>({})

  useEffect(() => {
    if (!url) {
      console.log('[useFetchWebMetadata] No URL provided')
      return
    }
    
    console.log(`[useFetchWebMetadata] Fetching metadata for URL: ${url}`)
    
    // Pass original URL - web service will handle proxy conversion
    webService.fetchWebMetadata(url)
      .then((metadata) => {
        console.log(`[useFetchWebMetadata] Received metadata for ${url}:`, metadata)
        setMetadata(metadata)
      })
      .catch((error) => {
        console.error(`[useFetchWebMetadata] Error fetching metadata for ${url}:`, error)
      })
  }, [url])

  return metadata
}
