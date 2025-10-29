import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, FileDown } from 'lucide-react'
import logger from '@/lib/logger'
import { Event } from 'nostr-tools'

interface ArticleExportMenuProps {
  event: Event
  title: string
}

export default function ArticleExportMenu({ event, title }: ArticleExportMenuProps) {
  const exportArticle = async () => {
    try {
      const content = event.content
      const filename = `${title}.adoc`
      
      // Export raw AsciiDoc content
      const blob = new Blob([content], { type: 'text/plain' })
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      logger.info('[ArticleExportMenu] Exported article as .adoc')
    } catch (error) {
      logger.error('[ArticleExportMenu] Error exporting article:', error)
      alert('Failed to export article. Please try again.')
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="shrink-0">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={exportArticle}>
          <FileDown className="mr-2 h-4 w-4" />
          Export as AsciiDoc
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

