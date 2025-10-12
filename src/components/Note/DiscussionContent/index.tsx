import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Event } from 'nostr-tools'
import { useMemo } from 'react'
import NostrNode from '../LongFormArticle/NostrNode'
import { remarkNostr } from '../LongFormArticle/remarkNostr'
import { Components } from '../LongFormArticle/types'

export default function DiscussionContent({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  const components = useMemo(
    () =>
      ({
        nostr: (props) => (
          <div className="not-prose my-2">
            <NostrNode
              rawText={props.rawText}
              bech32Id={props.bech32Id}
            />
          </div>
        )
      }) as Components,
    []
  )

  return (
    <div
      className={`prose prose-zinc max-w-none dark:prose-invert break-words overflow-wrap-anywhere ${className || ''}`}
    >
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
        {event.content}
      </Markdown>
    </div>
  )
}
