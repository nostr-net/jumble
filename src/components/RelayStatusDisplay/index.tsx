import { Check, X, AlertCircle } from 'lucide-react'
import { simplifyUrl } from '@/lib/url'

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
      
      <div className="space-y-1">
        {relayStatuses.map((status, index) => (
          <div
            key={index}
            className="flex items-center gap-2 text-sm"
          >
            <div className="flex-shrink-0">
              {status.success ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <X className="h-4 w-4 text-red-500" />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs truncate">
                  {simplifyUrl(status.url)}
                </span>
                {status.authAttempted && (
                  <div title="Authentication attempted">
                    <AlertCircle className="h-3 w-3 text-amber-500" />
                  </div>
                )}
              </div>
              
              {!status.success && status.error && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                  {status.error}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
