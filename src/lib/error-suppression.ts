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
    
    // Suppress YouTube API warnings
    if (message.includes('Unrecognized feature: \'web-share\'')) {
      return
    }
    
    // Suppress Canvas2D warnings
    if (message.includes('Canvas2D: Multiple readback operations')) {
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
    
    // Call original console.warn for unexpected warnings
    originalConsoleWarn.apply(console, args)
  }
}

// Initialize error suppression
if (typeof window !== 'undefined') {
  suppressExpectedErrors()
}
