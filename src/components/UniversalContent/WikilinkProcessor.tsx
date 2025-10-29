import { useEffect, useRef } from 'react'
import Wikilink from './Wikilink'

interface WikilinkProcessorProps {
  htmlContent: string
  className?: string
}

export default function WikilinkProcessor({ htmlContent, className }: WikilinkProcessorProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Find all wikilink spans and replace them with Wikilink components
    const wikilinkSpans = containerRef.current.querySelectorAll('span.wikilink')
    
    wikilinkSpans.forEach((span) => {
      const dTag = span.getAttribute('data-dtag')
      const displayText = span.getAttribute('data-display')
      
      if (dTag && displayText) {
        // Create a container for the Wikilink component
        const container = document.createElement('div')
        container.className = 'inline-block'
        
        // Replace the span with the container
        span.parentNode?.replaceChild(container, span)
        
        // Render the Wikilink component into the container
        // We'll use React's createRoot for this
        import('react-dom/client').then(({ createRoot }) => {
          const root = createRoot(container)
          root.render(<Wikilink dTag={dTag} displayText={displayText} />)
        })
      }
    })
  }, [htmlContent])

  return (
    <div 
      ref={containerRef}
      dangerouslySetInnerHTML={{ __html: htmlContent }}
      className={className}
    />
  )
}
