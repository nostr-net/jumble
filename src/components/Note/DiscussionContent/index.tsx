import { Event } from 'nostr-tools'
import SimpleContent from '../../UniversalContent/SimpleContent'

export default function DiscussionContent({
  event,
  className
}: {
  event: Event
  className?: string
}) {
  return (
    <SimpleContent
      event={event}
      className={className}
    />
  )
}
