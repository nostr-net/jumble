/**
 * Compact Table of Contents component for articles
 */

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Hash } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface TocItem {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  content: string
  className?: string
}

export default function TableOfContents({ content, className }: TableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [tocItems, setTocItems] = useState<TocItem[]>([])

  useEffect(() => {
    // Parse content for headings
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
    const items: TocItem[] = []

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1))
      const text = heading.textContent?.trim() || ''
      
      if (text) {
        // Use existing ID if available, otherwise generate one
        const existingId = heading.id
        const id = existingId || `heading-${index}-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
        
        items.push({
          id,
          text,
          level
        })
      }
    })

    setTocItems(items)
  }, [content])

  if (tocItems.length === 0) {
    return null
  }

  const scrollToHeading = (item: TocItem) => {
    // Try to find the element in the actual DOM
    const element = document.getElementById(item.id)
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start',
        inline: 'nearest'
      })
      setIsOpen(false)
    } else {
      // Fallback: try to find by text content
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      for (const heading of headings) {
        if (heading.textContent?.trim() === item.text) {
          heading.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'nearest'
          })
          setIsOpen(false)
          break
        }
      }
    }
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <div className="flex items-center gap-1">
            <Hash className="h-3 w-3" />
            <span>Table of Contents ({tocItems.length})</span>
          </div>
          {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <div className="bg-muted/30 rounded-md p-2 text-xs">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tocItems.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToHeading(item)}
                className={`block w-full text-left hover:text-foreground transition-colors ${
                  item.level === 1 ? 'font-medium' : ''
                } ${
                  item.level === 2 ? 'ml-2' : ''
                } ${
                  item.level === 3 ? 'ml-4' : ''
                } ${
                  item.level === 4 ? 'ml-6' : ''
                } ${
                  item.level === 5 ? 'ml-8' : ''
                } ${
                  item.level === 6 ? 'ml-10' : ''
                }`}
                style={{ 
                  fontSize: `${Math.max(0.75, 0.9 - (item.level - 1) * 0.05)}rem`,
                  lineHeight: '1.2'
                }}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
