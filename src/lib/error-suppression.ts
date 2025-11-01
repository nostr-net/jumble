/**
 * Suppress expected console errors that are not actionable
 * This helps reduce noise in the development console
 */

// Track suppressed errors to avoid spam
const suppressedErrors = new Set<string>()

export function suppressExpectedErrors() {
  // Override console.error to filter out expected errors
  const originalConsoleError = console.error
  
  console.error = (...args: any[]) => {
    const message = args.join(' ')
    
    // Suppress favicon 404 errors
    if (message.includes('favicon.ico') && message.includes('404')) {
      return
    }
    
    // Suppress CORS errors for external websites
    if (message.includes('CORS policy') && message.includes('Access-Control-Allow-Origin')) {
      return
    }
    
    // Suppress network errors for external websites
    if (message.includes('net::ERR_FAILED') && message.includes('200 (OK)')) {
      return
    }
    
    // Suppress additional network errors that are expected
    if (message.includes('net::ERR_FAILED') && (
      message.includes('404 (Not Found)') ||
      message.includes('302 (Found)') ||
      message.includes('ERR_NAME_NOT_RESOLVED') ||
      message.includes('ERR_CONNECTION_REFUSED')
    )) {
      return
    }
    
    // Suppress postMessage origin errors
    if (message.includes('Failed to execute \'postMessage\' on \'DOMWindow\'')) {
      return
    }
    
    // Suppress YouTube API warnings
    if (message.includes('Unrecognized feature: \'web-share\'')) {
      return
    }
    
    // Suppress Canvas2D warnings
    if (message.includes('Canvas2D: Multiple readback operations')) {
      return
    }
    
    // Suppress React "Maximum update depth exceeded" warnings
    // These are often caused by third-party libraries (e.g., Radix UI Popper)
    // where we cannot modify the source code directly
    if (message.includes('Maximum update depth exceeded')) {
      return
    }
    
    // Suppress Workbox precaching errors for development modules
    if (message.includes('Precaching did not find a match') && (
      message.includes('@vite/client') ||
      message.includes('main.tsx') ||
      message.includes('src/') ||
      message.includes('node_modules/')
    )) {
      return
    }
    
    // Suppress "too many concurrent REQs" errors (handled by circuit breaker)
    if (message.includes('too many concurrent REQs')) {
      return
    }
    
    // Suppress relay overload errors (handled by throttling)
    if (message.includes('Relay overloaded - too many concurrent requests')) {
      return
    }
    
    // Suppress nostr-tools "too many concurrent REQs" errors
    if (message.includes('NOTICE from') && message.includes('ERROR: too many concurrent REQs')) {
      return
    }
    
    // Suppress nostr-tools connection errors
    if (message.includes('NOTICE from') && (
      message.includes('ERROR:') ||
      message.includes('connection closed') ||
      message.includes('connection errored')
    )) {
      return
    }
    
    // Suppress WebSocket connection errors
    if (message.includes('WebSocket connection to') || message.includes('failed:') || message.includes('Close received after close')) {
      return
    }
    
    // Suppress Ping timeout errors
    if (message.includes('Ping timeout')) {
      return
    }
    
    // Call original console.error for unexpected errors
    originalConsoleError.apply(console, args)
  }
  
  // Override console.warn to filter out expected warnings
  const originalConsoleWarn = console.warn
  
  console.warn = (...args: any[]) => {
    const message = args.join(' ')
    
    // Suppress React DevTools suggestion (only show once)
    if (message.includes('Download the React DevTools')) {
      if (suppressedErrors.has('react-devtools')) {
        return
      }
      suppressedErrors.add('react-devtools')
    }
    
    // Suppress Workbox warnings
    if (message.includes('workbox') && (
      message.includes('will not be cached') ||
      message.includes('Network request for') ||
      message.includes('returned a response with status')
    )) {
      return
    }
    
    // Call original console.warn for unexpected warnings
    originalConsoleWarn.apply(console, args)
  }
  
  // Override console.log to filter out expected logs
  const originalConsoleLog = console.log
  
  console.log = (...args: any[]) => {
    const message = args.join(' ')
    
    // Suppress Workbox logs
    if (message.includes('workbox') || message.includes('[NoteStats]')) {
      return
    }
    
    // Suppress nostr-tools notices (ping, etc.)
    if (message.includes('NOTICE from')) {
      return
    }
    
    // Call original console.log for unexpected logs
    originalConsoleLog.apply(console, args)
  }
}

// Initialize error suppression
if (typeof window !== 'undefined') {
  suppressExpectedErrors()
}
