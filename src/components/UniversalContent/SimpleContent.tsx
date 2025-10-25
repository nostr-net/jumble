import { useMemo } from 'react'
import { cleanUrl } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import { Event } from 'nostr-tools'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkNostr } from '../Note/LongFormArticle/remarkNostr'
import NostrNode from '../Note/LongFormArticle/NostrNode'
import { cn } from '@/lib/utils'
import ImageWithLightbox from '../ImageWithLightbox'

interface SimpleContentProps {
  event?: Event
  content?: string
  className?: string
}

export default function SimpleContent({
  event,
  content,
  className
}: SimpleContentProps) {
  const imetaInfos = useMemo(() => event ? getImetaInfosFromEvent(event) : [], [event])
  
  const processedContent = useMemo(() => {
    const rawContent = content || event?.content || ''
    
    // Clean URLs
    const cleaned = rawContent.replace(
      /(https?:\/\/[^\s]+)/g,
      (url) => {
        try {
          return cleanUrl(url)
        } catch {
          return url
        }
      }
    )
    
    return cleaned
  }, [content, event?.content])

  // Process content to handle images and markdown
  const { markdownContent, mediaElements } = useMemo(() => {
    const lines = processedContent.split('\n')
    const elements: JSX.Element[] = []
    const markdownLines: string[] = []
    let key = 0

    lines.forEach((line) => {
      // Check if line contains an image URL
      const imageMatch = line.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|heic|svg))/i)
      
      if (imageMatch) {
        const imageUrl = imageMatch[1]
        const imageInfo = imetaInfos.find((info) => info.url === imageUrl)
        const imageData = imageInfo || { url: imageUrl, pubkey: event?.pubkey }
        
        elements.push(
          <div key={key++} className="my-4">
            <ImageWithLightbox
              image={imageData}
              className="max-w-full h-auto rounded-lg cursor-zoom-in"
            />
          </div>
        )
        
        // Add the rest of the line as text if there's anything else
        const beforeImage = line.substring(0, imageMatch.index).trim()
        const afterImage = line.substring(imageMatch.index! + imageUrl.length).trim()
        
        if (beforeImage || afterImage) {
          markdownLines.push(beforeImage + afterImage)
        }
      } else {
        // Regular text line - add to markdown processing
        markdownLines.push(line)
      }
    })

    return { 
      markdownContent: markdownLines.join('\n'), 
      mediaElements: elements 
    }
  }, [processedContent, imetaInfos, event?.pubkey])

  const components = useMemo(() => ({
    nostr: ({ rawText, bech32Id }: { rawText: string; bech32Id: string }) => (
      <NostrNode rawText={rawText} bech32Id={bech32Id} />
    ),
    a: ({ href, children, ...props }: any) => {
      if (!href) {
        return <span {...props} className="break-words" />
      }
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary hover:underline break-words"
        >
          {children}
        </a>
      )
    },
    p: (props: any) => <p {...props} className="mb-2 last:mb-0" />,
    code: (props: any) => <code {...props} className="bg-muted px-1 py-0.5 rounded text-sm break-words" />,
    pre: (props: any) => <pre {...props} className="bg-muted p-3 rounded overflow-x-auto" />,
    blockquote: (props: any) => <blockquote {...props} className="border-l-4 border-muted pl-4 italic" />,
    ul: (props: any) => <ul {...props} className="list-disc list-inside mb-2" />,
    ol: (props: any) => <ol {...props} className="list-decimal list-inside mb-2" />,
    li: (props: any) => <li {...props} className="mb-1" />,
    h1: (props: any) => <h1 {...props} className="text-xl font-bold mb-2 break-words" />,
    h2: (props: any) => <h2 {...props} className="text-lg font-bold mb-2 break-words" />,
    h3: (props: any) => <h3 {...props} className="text-base font-bold mb-2 break-words" />,
    strong: (props: any) => <strong {...props} className="font-bold" />,
    em: (props: any) => <em {...props} className="italic" />
  }), [])

  return (
    <div className={cn('prose prose-sm prose-zinc max-w-none break-words dark:prose-invert', className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkNostr]}
        urlTransform={(url) => {
          if (url.startsWith('nostr:')) {
            return url.slice(6) // Remove 'nostr:' prefix for rendering
          }
          return url
        }}
        components={components}
      >
        {markdownContent}
      </Markdown>
      {mediaElements}
    </div>
  )
}
