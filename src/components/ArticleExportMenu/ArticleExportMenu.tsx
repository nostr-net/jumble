import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, FileDown } from 'lucide-react'
import logger from '@/lib/logger'
import { Event, kinds } from 'nostr-tools'
import { ExtendedKind } from '@/constants'

interface ArticleExportMenuProps {
  event: Event
  title: string
}

export default function ArticleExportMenu({ event, title }: ArticleExportMenuProps) {
  // Determine export format based on event kind
  const getExportFormat = () => {
    if (event.kind === kinds.LongFormArticle || event.kind === ExtendedKind.WIKI_ARTICLE_MARKDOWN) {
      return { extension: 'md', mimeType: 'text/markdown', label: 'Markdown' }
    }
    // For 30818, 30041, 30040 - use AsciiDoc
    return { extension: 'adoc', mimeType: 'text/plain', label: 'AsciiDoc' }
  }

  const exportArticle = async () => {
    try {
      const content = event.content
      const format = getExportFormat()
      const filename = `${title}.${format.extension}`
      
      // Export raw content
      const blob = new Blob([content], { type: format.mimeType })
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      logger.info(`[ArticleExportMenu] Exported article as .${format.extension}`)
    } catch (error) {
      logger.error('[ArticleExportMenu] Error exporting article:', error)
      alert('Failed to export article. Please try again.')
    }
  }

  const format = getExportFormat()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="shrink-0" aria-label="Export article">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={exportArticle}>
          <FileDown className="mr-2 h-4 w-4" />
          Export as {format.label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

