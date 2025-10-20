import React, { Component, ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface MediaErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error) => void
}

interface MediaErrorBoundaryState {
  hasError: boolean
  error?: Error
}

export class MediaErrorBoundary extends Component<MediaErrorBoundaryProps, MediaErrorBoundaryState> {
  constructor(props: MediaErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): MediaErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Don't log expected media errors
    if (error.name === 'AbortError' || 
        error.message.includes('play() request was interrupted') ||
        error.message.includes('The play() request was interrupted')) {
      return
    }
    
    // Log unexpected errors
    console.warn('Media error boundary caught error:', error, errorInfo)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      
      return (
        <div className="flex items-center justify-center p-4 bg-muted/50 rounded-lg border border-dashed">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Media unavailable</span>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
