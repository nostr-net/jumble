import { cn } from '@/lib/utils'
import { cleanUrl } from '@/lib/url'

export default function ExternalLink({ url, className }: { url: string; className?: string }) {
  const cleanedUrl = cleanUrl(url)
  return (
    <a
      className={cn('text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 hover:underline', className)}
      href={cleanedUrl}
      target="_blank"
      onClick={(e) => e.stopPropagation()}
      rel="noreferrer noopener"
    >
      {cleanedUrl}
    </a>
  )
}
