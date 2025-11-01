import { isImage, isVideo, isAudio } from '@/lib/url'

/**
 * Preprocess markdown content to convert plain media URLs to proper markdown syntax
 * - Images: `https://example.com/image.png` -> `![](https://example.com/image.png)`
 * - Videos: `https://example.com/video.mp4` -> `![](https://example.com/video.mp4)`
 * - Audio: `https://example.com/audio.mp3` -> `![](https://example.com/audio.mp3)`
 */
export function preprocessMediaLinks(content: string): string {
  let processed = content
  
  // Find all matches but process them manually to avoid complex regex lookbehind
  const allMatches: Array<{ url: string; index: number }> = []
  let match
  
  // Find all candidate URLs
  const tempRegex = /https?:\/\/[^\s<>"']+/gi
  while ((match = tempRegex.exec(content)) !== null) {
    const index = match.index
    const url = match[0]
    const before = content.substring(Math.max(0, index - 10), index)
    
    // Check if this URL is already part of markdown syntax
    // Skip if preceded by: [text](url, ![text](url, or ](url
    if (before.match(/\[[^\]]*$/) || before.match(/\]\([^)]*$/) || before.match(/!\[[^\]]*$/)) {
      continue
    }
    
    allMatches.push({ url, index })
  }
  
  // Process in reverse order to preserve indices
  for (let i = allMatches.length - 1; i >= 0; i--) {
    const { url, index } = allMatches[i]
    
    // Check if URL is in code block
    const beforeUrl = content.substring(0, index)
    const backticksCount = (beforeUrl.match(/```/g) || []).length
    if (backticksCount % 2 === 1) {
      continue // In code block
    }
    
    // Check if URL is in inline code
    const lastBacktick = beforeUrl.lastIndexOf('`')
    if (lastBacktick !== -1) {
      const afterUrl = content.substring(index + url.length)
      const nextBacktick = afterUrl.indexOf('`')
      if (nextBacktick !== -1) {
        const codeBefore = beforeUrl.substring(lastBacktick + 1)
        const codeAfter = afterUrl.substring(0, nextBacktick)
        // If no newlines between backticks, it's inline code
        if (!codeBefore.includes('\n') && !codeAfter.includes('\n')) {
          continue
        }
      }
    }
    
    // Check if it's a media URL
    const isImageUrl = isImage(url)
    const isVideoUrl = isVideo(url)
    const isAudioUrl = isAudio(url)
    
    let replacement: string
    if (isImageUrl || isVideoUrl || isAudioUrl) {
      // Media URLs: convert to ![](url)
      replacement = `![](${url})`
    } else {
      // Don't convert non-media URLs - let autolink handle them
      continue
    }
    
    // Replace the URL
    processed = processed.substring(0, index) + replacement + processed.substring(index + url.length)
  }
  
  return processed
}

