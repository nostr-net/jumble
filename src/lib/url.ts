export function isWebsocketUrl(url: string): boolean {
  return /^wss?:\/\/.+$/.test(url)
}

// copy from nostr-tools/utils
export function normalizeUrl(url: string): string {
  try {
    if (url.indexOf('://') === -1) {
      if (url.startsWith('localhost:') || url.startsWith('localhost/')) {
        url = 'ws://' + url
      } else {
        url = 'wss://' + url
      }
    }
    
    // Parse the URL first to validate it
    const p = new URL(url)
    
    // Check if URL has query parameters or hash fragments that suggest it's not a relay
    // Relay URLs shouldn't have query params like ?token= or hash fragments
    const hasQueryParams = url.includes('?')
    const hasHashFragment = url.includes('#')
    
    // Block URLs with query params or hash fragments (these are likely not relays)
    if (hasQueryParams || hasHashFragment) {
      console.warn('Skipping URL with query/hash (not a relay):', url)
      return ''
    }
    
    p.pathname = p.pathname.replace(/\/+/g, '/')
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1)
    if (p.protocol === 'https:') {
      p.protocol = 'wss:'
    } else if (p.protocol === 'http:') {
      p.protocol = 'ws:'
    }
    
    // After protocol normalization, validate it's actually a websocket URL
    if (!isWebsocketUrl(p.toString())) {
      console.warn('Skipping non-websocket URL:', url)
      return ''
    }
    
    // Normalize localhost and local network addresses to always use ws:// instead of wss://
    // This fixes the common typo where people use wss:// for local relays
    if (isLocalNetworkUrl(p.toString())) {
      p.protocol = 'ws:'
    }
    
    if ((p.port === '80' && p.protocol === 'ws:') || (p.port === '443' && p.protocol === 'wss:')) {
      p.port = ''
    }
    p.searchParams.sort()
    p.hash = ''
    
    // Final validation: ensure we have a proper websocket URL
    const finalUrl = p.toString()
    if (!isWebsocketUrl(finalUrl)) {
      console.warn('Normalization resulted in invalid websocket URL:', finalUrl)
      return ''
    }
    
    return finalUrl
  } catch {
    console.error('Invalid URL:', url)
    return ''
  }
}

export function normalizeHttpUrl(url: string): string {
  try {
    if (url.indexOf('://') === -1) url = 'https://' + url
    const p = new URL(url)
    p.pathname = p.pathname.replace(/\/+/g, '/')
    if (p.pathname.endsWith('/')) p.pathname = p.pathname.slice(0, -1)
    if (p.protocol === 'wss:') {
      p.protocol = 'https:'
    } else if (p.protocol === 'ws:') {
      p.protocol = 'http:'
    }
    if (
      (p.port === '80' && p.protocol === 'http:') ||
      (p.port === '443' && p.protocol === 'https:')
    ) {
      p.port = ''
    }
    p.searchParams.sort()
    p.hash = ''
    return p.toString()
  } catch {
    console.error('Invalid URL:', url)
    return ''
  }
}

export function simplifyUrl(url: string): string {
  return url
    .replace('wss://', '')
    .replace('ws://', '')
    .replace('https://', '')
    .replace('http://', '')
    .replace(/\/$/, '')
}

export function isLocalNetworkUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    const hostname = url.hostname

    // Check if it's localhost
    if (hostname === 'localhost' || hostname === '::1') {
      return true
    }

    // Check if it's an IPv4 local network address
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
    if (ipv4Match) {
      const [, a, b, c, d] = ipv4Match.map(Number)
      return (
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 127 && b === 0 && c === 0 && d === 1)
      )
    }

    // Check if it's an IPv6 address
    if (hostname.includes(':')) {
      if (hostname === '::1') {
        return true // IPv6 loopback address
      }
      if (hostname.startsWith('fe80:')) {
        return true // Link-local address
      }
      if (hostname.startsWith('fc') || hostname.startsWith('fd')) {
        return true // Unique local address (ULA)
      }
    }

    return false
  } catch {
    return false // Return false for invalid URLs
  }
}

export function isImage(url: string) {
  try {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.svg']
    return imageExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}

export function isMedia(url: string) {
  try {
    const mediaExtensions = [
      '.mp4',
      '.webm',
      '.ogg',
      '.mov',
      '.mp3',
      '.wav',
      '.flac',
      '.aac',
      '.m4a',
      '.opus',
      '.wma'
    ]
    return mediaExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}

export function isAudio(url: string) {
  try {
    const audioExtensions = [
      '.mp3',
      '.wav',
      '.flac',
      '.aac',
      '.m4a',
      '.opus',
      '.wma',
      '.ogg' // ogg can be audio
    ]
    return audioExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}

export function isVideo(url: string) {
  try {
    const videoExtensions = [
      '.mp4',
      '.webm',
      '.mov',
      '.avi',
      '.wmv',
      '.flv',
      '.mkv',
      '.m4v',
      '.3gp'
    ]
    return videoExtensions.some((ext) => new URL(url).pathname.toLowerCase().endsWith(ext))
  } catch {
    return false
  }
}

/**
 * Remove tracking parameters from URLs
 * Removes common tracking parameters like utm_*, fbclid, gclid, etc.
 */
export function cleanUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    
    // List of tracking parameter prefixes and exact names to remove
    const trackingParams = [
      // Google Analytics & Ads
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
      'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
      
      // Facebook
      'fbclid', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
      
      // Twitter/X
      'twclid', 'twsrc',
      
      // Microsoft/Bing
      'msclkid', 'mc_cid', 'mc_eid',
      
      // Adobe
      'adobe_mc', 'adobe_mc_ref', 'adobe_mc_sdid',
      
      // Mailchimp
      'mc_cid', 'mc_eid',
      
      // HubSpot
      'hsCtaTracking', 'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw', 'hsa_mt', 'hsa_net', 'hsa_ver',
      
      // Marketo
      'mkt_tok',
      
      // YouTube
      'si', 'feature', 'kw', 'pp',
      
      // Other common tracking
      'ref', 'referrer', 'source', 'campaign', 'medium', 'content',
      'yclid', 'srsltid', '_ga', '_gl', 'igshid', 'epik', 'pk_campaign', 'pk_kwd',
      
      // Mobile app tracking
      'adjust_tracker', 'adjust_campaign', 'adjust_adgroup', 'adjust_creative',
      
      // Amazon
      'tag', 'linkCode', 'creative', 'creativeASIN', 'linkId', 'ascsubtag',
      
      // Affiliate tracking
      'aff_id', 'affiliate_id', 'aff', 'ref_', 'refer',
      
      // Social media share tracking
      'share', 'shared', 'sharesource'
    ]
    
    // Remove all tracking parameters
    trackingParams.forEach(param => {
      parsedUrl.searchParams.delete(param)
    })
    
    // Remove any parameter that starts with utm_
    Array.from(parsedUrl.searchParams.keys()).forEach(key => {
      if (key.startsWith('utm_') || key.startsWith('_')) {
        parsedUrl.searchParams.delete(key)
      }
    })
    
    return parsedUrl.toString()
  } catch {
    // If URL parsing fails, return original URL
    return url
  }
}
