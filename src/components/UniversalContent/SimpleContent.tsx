import { useMemo } from 'react'
import { cleanUrl } from '@/lib/url'
import { getImetaInfosFromEvent } from '@/lib/event'
import logger from '@/lib/logger'
import { Event } from 'nostr-tools'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { remarkNostr } from '../Note/LongFormArticle/remarkNostr'
import NostrNode from '../Note/LongFormArticle/NostrNode'
import { cn } from '@/lib/utils'
import ImageGallery from '../ImageGallery'
import MediaPlayer from '../MediaPlayer'

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
  
  // Extract video URLs from imeta tags to avoid duplicate rendering
  const imetaVideoUrls = useMemo(() => {
    return imetaInfos
      .filter(info => {
        // Check if the imeta info is a video by looking at the URL extension
        const url = info.url
        const extension = url.split('.').pop()?.toLowerCase()
        return extension && ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v'].includes(extension)
      })
      .map(info => {
        // Clean the URL first, then normalize
        const cleanedUrl = (() => {
          try {
            return cleanUrl(info.url)
          } catch {
            return info.url
          }
        })()
        
        try {
          return new URL(cleanedUrl).href
        } catch {
          return cleanedUrl
        }
      })
  }, [imetaInfos])
  
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

  // Process content to handle images, videos and markdown
  const { markdownContent, mediaElements } = useMemo(() => {
    const lines = processedContent.split('\n')
    const elements: JSX.Element[] = []
    const markdownLines: string[] = []
    let key = 0

    // Extract all image URLs from content
    const imageUrls: string[] = []
    lines.forEach((line) => {
      const imageMatch = line.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|heic|svg))/i)
      if (imageMatch) {
        imageUrls.push(imageMatch[1])
      }
    })

    // Extract all video URLs from content
    const videoUrls: string[] = []
    lines.forEach((line) => {
      const videoMatch = line.match(/(https?:\/\/[^\s]+\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv|m4v))/i)
      if (videoMatch) {
        videoUrls.push(videoMatch[1])
      }
    })

    // Get all unique images - prioritize imeta tags, then add content images that aren't in imeta
    const allImageInfos = [...imetaInfos] // Start with imeta images
    const processedUrls = new Set(imetaInfos.map(info => info.url))
    
    // Add content images that aren't already in imeta
    imageUrls.forEach(url => {
      if (!processedUrls.has(url)) {
        allImageInfos.push({ url: url, pubkey: event?.pubkey })
        processedUrls.add(url)
      }
    })

    // Get all unique videos - prioritize imeta tags, then add content videos that aren't in imeta
    const allVideoInfos = imetaInfos.filter(info => {
      // Check if the imeta info is a video by looking at the URL extension
      const url = info.url
      const extension = url.split('.').pop()?.toLowerCase()
      return extension && ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v'].includes(extension)
    })
    
    const processedVideoUrls = new Set(allVideoInfos.map(info => {
      try {
        return new URL(cleanUrl(info.url)).href
      } catch {
        return cleanUrl(info.url)
      }
    }))
    
    // Add content videos that aren't already in imeta
    videoUrls.forEach(url => {
      const cleanedUrl = (() => {
        try {
          return cleanUrl(url)
        } catch {
          return url
        }
      })()
      
      const normalizedUrl = (() => {
        try {
          return new URL(cleanedUrl).href
        } catch {
          return cleanedUrl
        }
      })()
      
      if (!processedVideoUrls.has(normalizedUrl)) {
        allVideoInfos.push({ url: url, pubkey: event?.pubkey })
        processedVideoUrls.add(normalizedUrl)
      }
    })

    logger.debug('[SimpleContent] Processing content:', { 
      totalLines: lines.length, 
      imetaImages: imetaInfos.length,
      contentImages: imageUrls.length,
      totalUniqueImages: allImageInfos.length,
      imetaVideos: imetaInfos.filter(info => {
        const extension = info.url.split('.').pop()?.toLowerCase()
        return extension && ['mp4', 'webm', 'ogg', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v'].includes(extension)
      }).length,
      contentVideos: videoUrls.length,
      totalUniqueVideos: allVideoInfos.length
    })

    // If we have images, create a single ImageGallery for all of them
    if (allImageInfos.length > 0) {
      logger.debug('[SimpleContent] Creating ImageGallery with all unique images:', { 
        count: allImageInfos.length, 
        urls: allImageInfos.map(i => i.url) 
      })
      
      elements.push(
        <div key={key++} className="my-4">
          <ImageGallery
            images={allImageInfos}
            className="max-w-[400px]"
          />
        </div>
      )
    }

    // Add all unique videos to elements
    allVideoInfos.forEach(videoInfo => {
      const cleanedVideoUrl = (() => {
        try {
          return cleanUrl(videoInfo.url)
        } catch {
          return videoInfo.url
        }
      })()
      
      elements.push(
        <div key={key++} className="my-4">
          <MediaPlayer
            src={cleanedVideoUrl}
            className="max-w-[400px] h-auto rounded-lg"
          />
        </div>
      )
    })

    // Process lines for text content (excluding images and videos)
    lines.forEach((line) => {
      // Skip lines that contain images or videos (already processed above)
      const hasImage = line.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|heic|svg))/i)
      const hasVideo = line.match(/(https?:\/\/[^\s]+\.(mp4|webm|ogg|avi|mov|wmv|flv|mkv|m4v))/i)
      
      if (hasImage || hasVideo) {
        return // Skip this line as it's already processed
      }

      // Regular text line - add to markdown processing
      markdownLines.push(line)
    })

    return { 
      markdownContent: markdownLines.join('\n'), 
      mediaElements: elements 
    }
  }, [processedContent, imetaInfos, event?.pubkey, imetaVideoUrls])

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
