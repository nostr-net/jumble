import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, FileDown } from 'lucide-react'
import { contentParserService } from '@/services/content-parser.service'
import logger from '@/lib/logger'
import { Event } from 'nostr-tools'

interface ArticleExportMenuProps {
  event: Event
  title: string
}

export default function ArticleExportMenu({ event, title }: ArticleExportMenuProps) {
  const exportArticle = async (format: 'pdf' | 'epub' | 'latex' | 'adoc' | 'html') => {
    try {
      const content = event.content
      const filename = `${title}.${format}`
      
      let blob: Blob = new Blob([''])
      
      if (format === 'adoc') {
        // Export raw AsciiDoc content
        blob = new Blob([content], { type: 'text/plain' })
      } else if (format === 'html') {
        // Parse the AsciiDoc content to HTML
        const parsedContent = await contentParserService.parseContent(content, {
          eventKind: event.kind,
          enableMath: true,
          enableSyntaxHighlighting: true
        })
        
        const htmlDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 20px; color: #666; }
  </style>
</head>
<body>
  <article>
    <h1>${title}</h1>
    ${parsedContent.html}
  </article>
</body>
</html>`
        
        blob = new Blob([htmlDocument], { type: 'text/html' })
      } else if (format === 'latex') {
        // Basic LaTeX conversion
        let processedContent = content.replace(/^= (.+)$/gm, '\\section{$1}')
        processedContent = processedContent.replace(/^== (.+)$/gm, '\\subsection{$1}')
        processedContent = processedContent.replace(/^=== (.+)$/gm, '\\subsubsection{$1}')
        blob = new Blob([processedContent], { type: 'text/plain' })
      } else if (format === 'pdf' || format === 'epub') {
        // Parse the AsciiDoc content to HTML using the content parser
        const parsedContent = await contentParserService.parseContent(content, {
          eventKind: event.kind,
          enableMath: true,
          enableSyntaxHighlighting: true
        })
        
        const htmlDocument = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 20px; color: #666; }
  </style>
</head>
<body>
  <article>
    <h1>${title}</h1>
    ${parsedContent.html}
  </article>
</body>
</html>`
        
        blob = new Blob([htmlDocument], { type: 'text/html' })
      }
      
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      
      logger.info(`[ArticleExportMenu] Exported article as ${format}`)
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
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()} className="w-56">
        <DropdownMenuItem onClick={() => exportArticle('html')}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Export as HTML</div>
            <div className="text-xs text-muted-foreground">Ready to view in browser</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportArticle('adoc')}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Export as AsciiDoc</div>
            <div className="text-xs text-muted-foreground">Raw .adoc file</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportArticle('pdf')}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Export as PDF</div>
            <div className="text-xs text-muted-foreground">HTML - use browser Print to PDF</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportArticle('epub')}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Export as EPUB</div>
            <div className="text-xs text-muted-foreground">HTML - convert with Calibre</div>
          </div>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportArticle('latex')}>
          <FileDown className="mr-2 h-4 w-4" />
          <div>
            <div>Export as LaTeX</div>
            <div className="text-xs text-muted-foreground">Basic conversion</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

