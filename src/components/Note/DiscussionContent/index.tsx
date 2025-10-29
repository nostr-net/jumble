import { Event } from 'nostr-tools'
import ParsedContent from '../../UniversalContent/ParsedContent'

export default function DiscussionContent({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  return (
    <ParsedContent
      event={event}
      field="content"
      className={className}
      showMedia={true}
      showLinks={false}
      showHashtags={true}
      showNostrLinks={false}
    />
  )
}
