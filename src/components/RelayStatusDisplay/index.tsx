import { Check, X } from 'lucide-react'
import { simplifyUrl } from '@/lib/url'

/**
 * Format relay error messages to be more user-friendly
 */
function formatRelayError(error: string): string {
  const lowerError = error.toLowerCase()
  
  // Handle confusing relay error messages
  if (lowerError.includes('blocked') && lowerError.includes('event marked as protected')) {
    return 'Relay rejected this content (may be due to content policy)'
  }
  
  if (lowerError.includes('blocked')) {
    return 'Relay blocked this content'
  }
  
  if (lowerError.includes('rate limit') || lowerError.includes('rate-limit')) {
    return 'Rate limited - please wait before trying again'
  }
  
  if (lowerError.includes('auth') && lowerError.includes('required')) {
    return 'Authentication required'
  }
  
  if (lowerError.includes('writes disabled') || lowerError.includes('write disabled')) {
    return 'Relay has temporarily disabled writes'
  }
  
  if (lowerError.includes('invalid key')) {
    return 'Authentication failed - invalid key'
  }
  
  if (lowerError.includes('timeout')) {
    return 'Request timed out'
  }
  
  if (lowerError.includes('connection') && lowerError.includes('refused')) {
    return 'Connection refused by relay'
  }
  
  // Return original error if no specific formatting applies
  return error
}

interface RelayStatus {
  url: string
  success: boolean
  error?: string
  authAttempted?: boolean
}

interface RelayStatusDisplayProps {
  relayStatuses: RelayStatus[]
  successCount: number
  totalCount: number
  className?: string
}

export default function RelayStatusDisplay({
  relayStatuses,
  successCount,
  totalCount,
  className = ''
}: RelayStatusDisplayProps) {
  if (relayStatuses.length === 0) {
    return null
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Published to {successCount} of {totalCount} relays
      </div>
      
      <div className="space-y-1 max-w-full">
        {relayStatuses.map((status, index) => (
          <div
            key={index}
            className="flex items-start gap-2 text-sm min-w-0"
          >
            <div className="flex-shrink-0 mt-0.5">
              {status.success ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <X className="h-4 w-4 text-red-500" />
              )}
            </div>
            
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs break-all">
                    {simplifyUrl(status.url)}
                  </span>
                  {status.authAttempted && !status.success && (
                    <span className="text-xs text-red-600 dark:text-red-400 flex-shrink-0">
                      (auth failed)
                    </span>
                  )}
                </div>
                
                {!status.success && status.error && (
                  <div className="text-xs text-red-600 dark:text-red-400 break-words">
                    {formatRelayError(status.error)}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
