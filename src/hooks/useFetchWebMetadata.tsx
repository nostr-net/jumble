import { TWebMetadata } from '@/types'
import { useEffect, useState } from 'react'
import webService from '@/services/web.service'

export function useFetchWebMetadata(url: string) {
  const [metadata, setMetadata] = useState<TWebMetadata>({})

  useEffect(() => {
    if (!url) {
      return
    }
    
    // Pass original URL - web service will handle proxy conversion
    webService.fetchWebMetadata(url)
      .then((metadata) => {
        setMetadata(metadata)
      })
      .catch(() => {
        // Silent fail
      })
  }, [url])

  return metadata
}
